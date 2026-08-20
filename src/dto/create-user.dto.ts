import { IsEmail, IsString } from "../pipes/validation.pipe.js";

export class CreateUserDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;
}
