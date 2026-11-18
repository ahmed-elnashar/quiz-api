import { Transform } from 'class-transformer';

/** Trims string input; leaves other values for the validators to reject. */
export function Trim(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
}

/** Trims and lowercases string input. */
export function TrimLower(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
}
