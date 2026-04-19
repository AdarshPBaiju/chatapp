export type ValidationFunction = (value: any, allValues?: any) => string | undefined;

export class RuleBuilder {
  private rules: ValidationFunction[] = [];
  required(message = "This field is required"): this {
    this.rules.unshift((value) => 
      (!value || (typeof value === "string" && value.trim() === "") ? message : undefined)
    );
    return this;
  }

  optional(): this {
    return this;
  }

  email(message = "Please enter a valid email address"): this {
    this.rules.push((value) => {
      if (!value) return undefined;
      const regex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
      return regex.test(value) ? undefined : message;
    });
    return this;
  }

  min(min: number, message?: string): this {
    const msg = message || `Must be at least ${min} characters`;
    this.rules.push((value) => {
      if (!value) return undefined;
      return String(value).length >= min ? undefined : msg;
    });
    return this;
  }

  max(max: number, message?: string): this {
    const msg = message || `Must be no more than ${max} characters`;
    this.rules.push((value) => {
      if (!value) return undefined;
      return String(value).length <= max ? undefined : msg;
    });
    return this;
  }

  matches(fieldName: string, message = "Fields do not match"): this {
    this.rules.push((value, allValues) => {
      return value === allValues[fieldName] ? undefined : message;
    });
    return this;
  }

  name(message = "Please enter a valid name"): this {
    this.rules.push((value) => {
      if (!value) return undefined;
      const regex = /^[a-zA-Z\s'-]+$/;
      return regex.test(value) ? undefined : message;
    });
    return this;
  }

  file(options: { maxMb?: number; exts?: string[] }, message?: string): this {
    this.rules.push((value) => {
      if (!(value instanceof File)) return undefined;
      
      if (options.maxMb && value.size > options.maxMb * 1024 * 1024) {
        return message || `File size must be less than ${options.maxMb}MB`;
      }
      
      if (options.exts && options.exts.length > 0) {
        const ext = value.name.split('.').pop()?.toLowerCase();
        if (!ext || !options.exts.includes(ext)) {
          return message || `Supported formats: ${options.exts.join(', ')}`;
        }
      }
      return undefined;
    });
    return this;
  }

  build(): ValidationFunction[] {
    return this.rules;
  }
}

export class V {
  string(): RuleBuilder {
    return new RuleBuilder();
  }

  required(message?: string): RuleBuilder {
    return new RuleBuilder().required(message);
  }

  email(message?: string): RuleBuilder {
    return new RuleBuilder().email(message);
  }

  file(options: { maxMb?: number; exts?: string[] }, message?: string): RuleBuilder {
    return new RuleBuilder().file(options, message);
  }
}

export const v = new V();
