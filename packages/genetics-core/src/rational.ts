export interface RationalValue { numerator: string; denominator: string }

function abs(value: bigint): bigint { return value < 0n ? -value : value; }
function gcd(a: bigint, b: bigint): bigint {
  let left = abs(a);
  let right = abs(b);
  while (right !== 0n) [left, right] = [right, left % right];
  return left;
}

export class Rational {
  readonly numerator: bigint;
  readonly denominator: bigint;

  constructor(numerator: bigint | number | string, denominator: bigint | number | string = 1n) {
    const rawNumerator = BigInt(numerator);
    const rawDenominator = BigInt(denominator);
    if (rawDenominator === 0n) throw new RangeError('Rational denominator cannot be zero.');
    const sign = rawDenominator < 0n ? -1n : 1n;
    const divisor = gcd(rawNumerator, rawDenominator);
    this.numerator = (rawNumerator / divisor) * sign;
    this.denominator = abs(rawDenominator / divisor);
  }

  static readonly ZERO = new Rational(0n);
  static readonly ONE = new Rational(1n);

  static from(value: Rational | RationalValue): Rational {
    return value instanceof Rational ? value : new Rational(value.numerator, value.denominator);
  }

  add(other: Rational): Rational {
    return new Rational(
      this.numerator * other.denominator + other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }

  subtract(other: Rational): Rational {
    return new Rational(
      this.numerator * other.denominator - other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }

  multiply(other: Rational): Rational {
    return new Rational(this.numerator * other.numerator, this.denominator * other.denominator);
  }

  divide(other: Rational): Rational {
    if (other.numerator === 0n) throw new RangeError('Cannot divide by zero.');
    return new Rational(this.numerator * other.denominator, this.denominator * other.numerator);
  }

  equals(other: Rational): boolean {
    return this.numerator === other.numerator && this.denominator === other.denominator;
  }

  compare(other: Rational): -1 | 0 | 1 {
    const difference = this.numerator * other.denominator - other.numerator * this.denominator;
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
  }

  isNegative(): boolean { return this.numerator < 0n; }
  isZero(): boolean { return this.numerator === 0n; }
  toNumber(): number {
    if (this.numerator === 0n) return 0;
    const sign = this.numerator < 0n ? -1 : 1;
    const numeratorDigits = abs(this.numerator).toString();
    const denominatorDigits = this.denominator.toString();
    const significantDigits = 16;
    const numeratorTaken = Math.min(significantDigits, numeratorDigits.length);
    const denominatorTaken = Math.min(significantDigits, denominatorDigits.length);
    const numeratorLeading = Number(numeratorDigits.slice(0, numeratorTaken));
    const denominatorLeading = Number(denominatorDigits.slice(0, denominatorTaken));
    const exponent =
      (numeratorDigits.length - numeratorTaken) -
      (denominatorDigits.length - denominatorTaken);
    return sign * (numeratorLeading / denominatorLeading) * 10 ** exponent;
  }
  toJSON(): RationalValue { return { numerator: this.numerator.toString(), denominator: this.denominator.toString() }; }
  toString(): string { return `${this.numerator}/${this.denominator}`; }
}

export function sumRationals(values: Iterable<Rational>): Rational {
  let total = Rational.ZERO;
  for (const value of values) total = total.add(value);
  return total;
}
