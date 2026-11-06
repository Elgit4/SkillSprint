/**
 * Normalize a telephone number for the SkillSprint phone-plus-PIN sign-in flow.
 * Ghana local numbers are accepted as 0XXXXXXXXX or the nine-digit national
 * number. International numbers must include + or the 00 international prefix.
 */
export function normalizePhone(value) {
  const raw = String(value ?? '').trim();
  const explicitInternational = raw.startsWith('+') || raw.startsWith('00');
  let digits = raw.replace(/\D/g, '');

  if (digits.startsWith('00')) digits = digits.slice(2);

  if (digits.startsWith('233')) {
    let nationalNumber = digits.slice(3);
    // Some Ghana users write the trunk zero after the country code (+233 0...).
    if (nationalNumber.length === 10 && nationalNumber.startsWith('0')) {
      nationalNumber = nationalNumber.slice(1);
    }
    if (!/^\d{9}$/.test(nationalNumber)) {
      throw new Error('Enter a valid Ghana telephone number, for example 024 123 4567.');
    }
    digits = '233' + nationalNumber;
  } else if (!explicitInternational && digits.startsWith('0')) {
    if (!/^0\d{9}$/.test(digits)) {
      throw new Error('Enter a valid Ghana telephone number, for example 024 123 4567.');
    }
    digits = '233' + digits.slice(1);
  } else if (!explicitInternational && /^\d{9}$/.test(digits)) {
    digits = '233' + digits;
  } else if (!explicitInternational) {
    throw new Error('Include your country code for an international telephone number.');
  }

  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    throw new Error('Enter a valid telephone number with country code, for example +233 24 123 4567.');
  }
  return '+' + digits;
}
