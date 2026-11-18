import { registerDecorator, type ValidationOptions } from 'class-validator';

function isCorrectOption(option: unknown): boolean {
  return typeof option === 'object' && option !== null && (option as { isCorrect?: unknown }).isCorrect === true;
}

/** Validates that an options array contains exactly one option with `isCorrect: true`. */
export function HasExactlyOneCorrectOption(validationOptions?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    registerDecorator({
      name: 'hasExactlyOneCorrectOption',
      target: target.constructor,
      propertyName: String(propertyKey),
      options: { message: '$property must contain exactly one correct option', ...validationOptions },
      validator: {
        validate(value: unknown): boolean {
          return Array.isArray(value) && value.filter(isCorrectOption).length === 1;
        },
      },
    });
  };
}
