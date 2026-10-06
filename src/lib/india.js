export const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala',
  'Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura',
  'Uttar Pradesh','Uttarakhand','West Bengal','Delhi','Jammu and Kashmir','Ladakh','Chandigarh','Puducherry',
]

export const validateAddress = (a) => {
  const e = {}
  if (a.fullName.trim().length < 2) e.fullName = 'Enter the recipient’s name'
  if (!/^[6-9]\d{9}$/.test(a.phone.trim())) e.phone = 'Enter a valid 10-digit mobile number'
  if (a.line1.trim().length < 3) e.line1 = 'Enter your address'
  if (a.city.trim().length < 2) e.city = 'Enter your city'
  if (!a.state) e.state = 'Select your state'
  if (!/^\d{6}$/.test(a.postalCode.trim())) e.postalCode = 'Enter a 6-digit PIN code'
  return e
}
