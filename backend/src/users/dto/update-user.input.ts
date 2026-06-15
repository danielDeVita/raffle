import { InputType, Field, Int } from '@nestjs/graphql';
import {
  IsOptional,
  IsString,
  MinLength,
  Matches,
  IsEnum,
  MaxLength,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import {
  DocumentType,
  SellerPaymentAccountIdentifierType,
} from '../../common/enums';
import {
  PASSWORD_LOWERCASE_MESSAGE,
  PASSWORD_LOWERCASE_REGEX,
  PASSWORD_MIN_LENGTH,
  PASSWORD_NUMBER_MESSAGE,
  PASSWORD_NUMBER_REGEX,
  PASSWORD_UPPERCASE_MESSAGE,
  PASSWORD_UPPERCASE_REGEX,
} from '../../common/constants/password.constants';

@InputType()
export class UpdateProfileInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(2)
  nombre?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(2)
  apellido?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  phone?: string;
}

@InputType()
export class ChangePasswordInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  oldPassword!: string;

  @Field()
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @Matches(PASSWORD_UPPERCASE_REGEX, { message: PASSWORD_UPPERCASE_MESSAGE })
  @Matches(PASSWORD_LOWERCASE_REGEX, { message: PASSWORD_LOWERCASE_MESSAGE })
  @Matches(PASSWORD_NUMBER_REGEX, { message: PASSWORD_NUMBER_MESSAGE })
  newPassword!: string;
}

@InputType()
export class UpdateKycInput {
  @Field(() => DocumentType)
  @IsEnum(DocumentType)
  documentType!: DocumentType;

  @Field()
  @IsString()
  @MinLength(7, { message: 'Número de documento inválido' })
  @MaxLength(20, { message: 'Número de documento inválido' })
  documentNumber!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  documentFrontUrl?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  documentBackUrl?: string;

  // Address fields
  @Field()
  @IsString()
  @MinLength(2)
  street!: string;

  @Field()
  @IsString()
  streetNumber!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  apartment?: string;

  @Field()
  @IsString()
  @MinLength(2)
  city!: string;

  @Field()
  @IsString()
  @MinLength(2)
  province!: string;

  @Field()
  @IsString()
  @MinLength(4)
  postalCode!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  phone?: string;

  // CUIT/CUIL for sellers (optional at first)
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}-\d{8}-\d$/, {
    message: 'CUIT/CUIL debe tener el formato XX-XXXXXXXX-X',
  })
  cuitCuil?: string;
}

@InputType()
export class AcceptTermsInput {
  @Field()
  @IsString()
  termsVersion!: string;
}

@InputType()
export class UpdateAvatarInput {
  @Field()
  @IsString()
  @IsNotEmpty({ message: 'La URL del avatar es requerida' })
  avatarUrl!: string;
}

@InputType()
export class CreateSellerReviewInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  raffleId!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comentario?: string;
}

@InputType()
export class UpsertSellerPaymentAccountInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  accountHolderName!: string;

  @Field(() => SellerPaymentAccountIdentifierType)
  @IsEnum(SellerPaymentAccountIdentifierType)
  accountIdentifierType!: SellerPaymentAccountIdentifierType;

  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  accountIdentifier!: string;
}
