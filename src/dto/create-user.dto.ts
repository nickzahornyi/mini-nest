import { z } from 'zod';

export class CreateUserDto {
  static readonly schema = z.object({
    name: z.string().trim().min(1, "must be a non-empty string"),
    email: z.email("must be a valid email"),
  });

  name!: string;

  email!: string;
}
