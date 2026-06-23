function prefixedFieldName(key: string) {
  return new RegExp(`^\\d+_${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
}

export function getFormDataValue(formData: FormData, key: string): FormDataEntryValue | null {
  const exact = formData.get(key);
  if (exact !== null) {
    return exact;
  }

  const prefixedPattern = prefixedFieldName(key);
  let match: FormDataEntryValue | null = null;
  let matched = false;

  for (const [name, value] of formData.entries()) {
    if (!prefixedPattern.test(name)) {
      continue;
    }

    if (matched) {
      return null;
    }

    matched = true;
    match = value;
  }

  return match;
}

export function getFormDataString(formData: FormData, key: string, fallback = "") {
  const value = getFormDataValue(formData, key);
  return typeof value === "string" ? value : fallback;
}

export function isFormDataOn(formData: FormData, key: string) {
  return getFormDataString(formData, key) === "on";
}
