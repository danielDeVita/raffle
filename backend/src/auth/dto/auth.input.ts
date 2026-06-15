import { Field, InputType } from '@nestjs/graphql';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsOptional,
  Matches,
  MaxLength,
  MinLength,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import {
  PASSWORD_LOWERCASE_MESSAGE,
  PASSWORD_LOWERCASE_REGEX,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MIN_LENGTH_MESSAGE,
  PASSWORD_NUMBER_MESSAGE,
  PASSWORD_NUMBER_REGEX,
  PASSWORD_UPPERCASE_MESSAGE,
  PASSWORD_UPPERCASE_REGEX,
} from '../../common/constants/password.constants';

@InputType()
export class RegisterInput {
  @Field()
  @IsEmail({}, { message: 'Debe ser un email válido' })
  @MaxLength(255)
  email!: string;

  @Field()
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_MIN_LENGTH_MESSAGE })
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message:
      'La contraseña debe contener al menos una mayúscula, una minúscula y un número',
  })
  password!: string;

  @Field()
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(50)
  nombre!: string;

  @Field()
  @IsString()
  @MinLength(2, { message: 'El apellido debe tener al menos 2 caracteres' })
  @MaxLength(50)
  apellido!: string;

  @Field()
  @IsDateString({}, { message: 'Fecha de nacimiento inválida' })
  fechaNacimiento!: string;

  @Field()
  @IsBoolean()
  acceptTerms!: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  captchaToken?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  promotionToken?: string;
}

@InputType()
export class LoginInput {
  @Field()
  @IsEmail({}, { message: 'Debe ser un email válido' })
  email!: string;

  @Field()
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  @IsString()
  password!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  captchaToken?: string;
}

@InputType()
export class RequestPasswordResetInput {
  @Field()
  @IsEmail({}, { message: 'Debe ser un email válido' })
  @MaxLength(255)
  email!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  captchaToken?: string;
}

@InputType()
export class ResetPasswordInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token!: string;

  @Field()
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_MIN_LENGTH_MESSAGE })
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(PASSWORD_UPPERCASE_REGEX, { message: PASSWORD_UPPERCASE_MESSAGE })
  @Matches(PASSWORD_LOWERCASE_REGEX, { message: PASSWORD_LOWERCASE_MESSAGE })
  @Matches(PASSWORD_NUMBER_REGEX, { message: PASSWORD_NUMBER_MESSAGE })
  newPassword!: string;
}
