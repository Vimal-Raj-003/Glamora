export const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala',
  'Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura',
  'Uttar Pradesh','Uttarakhand','West Bengal','Delhi','Jammu and Kashmir','Ladakh','Chandigarh','Puducherry',
]

export const validateAddress = (a) => {
  const e = {}
  if (a.full_name.trim().length < 2) e.full_name = 'Enter the recipient’s name'
  if (!/^[6-9]\d{9}$/.test(a.phone.trim())) e.phone = 'Enter a valid 10-digit mobile number'
  if (a.line1.trim().length < 3) e.line1 = 'Enter your address'
  if (a.city.trim().length < 2) e.city = 'Enter your city'
  if (!a.state) e.state = 'Select your state'
  if (!/^\d{6}$/.test(a.postal_code.trim())) e.postal_code = 'Enter a 6-digit PIN code'
  return e
}
