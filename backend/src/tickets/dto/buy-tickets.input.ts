import { Field, InputType, Int } from '@nestjs/graphql';
import { IsPositive, Min } from 'class-validator';

@InputType()
export class BuyTicketsInput {
  @Field()
  raffleId!: string;

  @Field(() => Int)
  @IsPositive()
  @Min(1)
  cantidad!: number;
}
