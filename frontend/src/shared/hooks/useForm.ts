import { useState, useCallback, useMemo } from "react";
import { ValidationFunction, RuleBuilder } from "../lib/validation";

interface FormSchema {
  [key: string]: ValidationFunction[] | RuleBuilder;
}

interface UseFormOptions<T> {
  initialValues: T;
  schema: FormSchema;
  onSubmit: (values: T) => void | Promise<void>;
  validateOnChange?: boolean;
}

export function useForm<T extends Record<string, any>>({
  initialValues,
  schema,
  onSubmit,
  validateOnChange = false,
}: UseFormOptions<T>) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateField = useCallback(
    (name: keyof T, val: any, currentValues: T) => {
      const entry = schema[name as string];
      if (!entry) return undefined;

      const rules = entry instanceof RuleBuilder ? entry.build() : entry;
      
      for (const rule of rules) {
        const error = rule(val, currentValues);
        if (error) return error;
      }
      return undefined;
    },
    [schema]
  );

  const setFieldValue = useCallback(
    (name: keyof T, value: any) => {
      setValues((prev) => {
        const next = { ...prev, [name]: value };
        if (validateOnChange || touched[name]) {
          const error = validateField(name, value, next);
          setErrors((prevErrors) => ({ ...prevErrors, [name]: error }));
        }
        return next;
      });
    },
    [validateField, validateOnChange, touched]
  );

  const setFieldTouched = useCallback(
    (name: keyof T) => {
      setTouched((prev) => ({ ...prev, [name]: true }));
      const error = validateField(name, values[name], values);
      setErrors((prevErrors) => ({ ...prevErrors, [name]: error }));
    },
    [validateField, values]
  );

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Validate all fields
    const newErrors: Partial<Record<keyof T, string>> = {};
    let hasErrors = false;

    Object.keys(schema).forEach((key) => {
      const error = validateField(key as keyof T, values[key], values);
      if (error) {
        newErrors[key as keyof T] = error;
        hasErrors = true;
      }
    });

    setErrors(newErrors);
    setTouched(
      Object.keys(schema).reduce(
        (acc, key) => ({ ...acc, [key]: true }),
        {} as Partial<Record<keyof T, boolean>>
      )
    );

    if (hasErrors) return;

    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getFieldProps = <K extends keyof T>(name: K) => ({
    value: values[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const target = e.target;
      const val = (target instanceof HTMLInputElement && target.type === "checkbox") 
        ? target.checked 
        : target.value;
      setFieldValue(name, val);
    },
    onBlur: () => setFieldTouched(name),
    error: touched[name] ? errors[name] : undefined,
  });

  return {
    values,
    errors,
    touched,
    isSubmitting,
    setValues,
    setFieldValue,
    setErrors,
    setFieldTouched,
    handleSubmit,
    getFieldProps,
    isValid: useMemo(() => Object.values(errors).every((e) => !e), [errors]),
  };
}
