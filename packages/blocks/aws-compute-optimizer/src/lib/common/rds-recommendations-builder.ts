import {
  ComputeOptimizerClient,
  Finding,
  GetRDSDatabaseRecommendationsCommand,
  GetRDSDatabaseRecommendationsCommandInput,
  GetRDSDatabaseRecommendationsCommandOutput,
  RDSDBRecommendation,
} from '@aws-sdk/client-compute-optimizer';
import { getResourceIdFromArn, makeAwsRequest } from '@openops/common';
import {
  filterOutRecommendationOptionsWithoutSavings,
  sortRecommendationOptionsByRank,
} from './filter-recommendations';
import {
  ComputeOptimizerRecommendation,
  getRecommendations,
} from './get-recommendations';
import { RecommendationsBuilder } from './recommendations-builder';

export class RdsRecommendationsBuilder
  implements RecommendationsBuilder<Finding, RDSDBRecommendation>
{
  recommendationType: string;
  findingType: Finding;
  credentials: any;

  constructor(
    credentials: any,
    findingType: Finding,
    recommendationType: string,
  ) {
    this.credentials = credentials;
    this.findingType = findingType;
    this.recommendationType = recommendationType;
  }

  public getRecommendations(
    credentials: any,
    region: string,
    arns?: string[],
  ): Promise<ComputeOptimizerRecommendation[]> {
    return getRecommendations(this, credentials, region, arns);
  }

  public async makeRequest(
    client: ComputeOptimizerClient,
    filters: { filters: unknown[] },
    arns?: string[],
  ): Promise<{ result?: RDSDBRecommendation[] }> {
    const command = new GetRDSDatabaseRecommendationsCommand({
      ...filters,
      resourceArns: arns,
    } as GetRDSDatabaseRecommendationsCommandInput);

    const response: unknown[] = await makeAwsRequest(client, command);
    const recommendations: RDSDBRecommendation[] = response.flatMap(
      (result) =>
        (result as GetRDSDatabaseRecommendationsCommandOutput)
          .rdsDBRecommendations ?? [],
    );

    return {
      result: recommendations,
    };
  }

  public getAccountId(resource: RDSDBRecommendation): string {
    if (resource.accountId) {
      return resource.accountId;
    }

    throw new Error('Resource accountId cannot be null');
  }

  public getResourceArn(resource: RDSDBRecommendation): string {
    if (resource.resourceArn) {
      return resource.resourceArn;
    }

    throw new Error('Resource arn cannot be null');
  }

  public createResourceObj(
    recommendation: RDSDBRecommendation,
    region: string,
    accountName?: string,
  ): any {
    return {
      region,
      account_name: accountName,
      arn: recommendation.resourceArn,
      account_id: recommendation.accountId,
      displayName: recommendation.dbClusterIdentifier,
      db_instance_identifier: recommendation.resourceArn
        ? getResourceIdFromArn(recommendation.resourceArn)
        : undefined,
      db_instance_class: recommendation.currentDBInstanceClass,
    };
  }

  public createRecommendation(recommendation: RDSDBRecommendation): any {
    const optionsWithSavings = filterOutRecommendationOptionsWithoutSavings(
      recommendation.instanceRecommendationOptions ?? [],
    );
    const sortedByRank = sortRecommendationOptionsByRank(optionsWithSavings);

    return {
      options: sortedByRank.map((option) => {
        return {
          monthlyPotentialSavings: {
            currency:
              option.savingsOpportunity?.estimatedMonthlySavings?.currency,
            value: option.savingsOpportunity?.estimatedMonthlySavings?.value,
          },
          details: {
            performanceRisk: option.performanceRisk,
            currentInstanceType: recommendation.currentDBInstanceClass,
            suggestedInstanceType: option.dbInstanceClass,
          },
        };
      }),
      type: this.recommendationType,
    };
  }
}
