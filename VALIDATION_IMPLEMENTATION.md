# Backend Validation Implementation

This document describes the backend validation system that matches the frontend validation functions.

## Overview

The backend now includes comprehensive validation that mirrors the frontend validation logic, ensuring data consistency and security across the application.

## Files Created/Modified

### 1. `src/utils/validation.ts`
Contains all validation functions that match the frontend validation:

- `validateEmail(email: string)` - Email format validation
- `validatePassword(password: string)` - Password strength validation
- `validateUsername(username: string)` - Username format validation
- `validateTelegram(telegram: string)` - Telegram username validation
- `validateReferralCode(code: string)` - Referral code validation (optional)
- `validateForm()` - Generic form validation helper
- `validateSignupData()` - Signup-specific validation
- `validateSigninData()` - Signin-specific validation
- `validateTelegramData()` - Telegram-specific validation
- `validateUsernameData()` - Username-specific validation

### 2. `src/middlewares/validation.ts`
Contains Express middleware functions for easy integration:

- `validateSignup` - Middleware for signup endpoint
- `validateSignin` - Middleware for signin endpoint
- `validateTelegram` - Middleware for telegram endpoint
- `validateUsername` - Middleware for username endpoint

### 3. `src/api/users.ts` (Modified)
Updated endpoints to use validation middleware:

- `/signup` - Now uses `validateSignup` middleware
- `/signin` - Now uses `validateSignin` middleware
- `/set-telegram` - Now uses `validateTelegram` middleware
- `/set-name` - Now uses `validateUsername` middleware

## Validation Rules

### Email Validation
- Required field
- Must match email regex pattern: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- Error message: "Please enter a valid email address"

### Password Validation
- Required field
- Minimum length: 6 characters
- Maximum length: 128 characters
- Must contain at least one letter
- Must contain at least one number
- Error messages vary based on specific validation failure

### Username Validation
- Required field
- Minimum length: 2 characters
- Maximum length: 50 characters
- Allowed characters: letters, numbers, spaces, hyphens, underscores
- Pattern: `/^[a-zA-Z0-9\s\-_]+$/`

### Telegram Username Validation
- Required field
- Minimum length: 5 characters (after removing @)
- Maximum length: 32 characters (after removing @)
- Allowed characters: letters, numbers, underscores
- Pattern: `/^[a-zA-Z0-9_]+$/`
- Automatically removes @ prefix if present

### Referral Code Validation
- Optional field (empty string is valid)
- If provided: minimum length 3 characters, maximum 20 characters
- Allowed characters: letters, numbers, hyphens, underscores
- Pattern: `/^[a-zA-Z0-9\-_]+$/`

## Error Response Format

When validation fails, the API returns:

```json
{
  "message": "Validation failed",
  "code": 400,
  "errors": {
    "fieldName": "Specific error message"
  }
}
```

## Usage Examples

### Using Validation Middleware

```typescript
// In your route definition
router.post('/signup', validateSignup, async (req, res) => {
  // Your route handler
});
```

### Using Validation Functions Directly

```typescript
import { validateEmail, validatePassword } from '../utils/validation';

const emailResult = validateEmail('test@example.com');
if (!emailResult.isValid) {
  console.log(emailResult.message);
}
```

## Testing

Run the validation test script:

```bash
node test-validation.js
```

This will test all validation functions with various inputs to ensure they match the frontend behavior.

## Benefits

1. **Consistency**: Backend validation matches frontend validation exactly
2. **Security**: Prevents invalid data from reaching the database
3. **User Experience**: Consistent error messages across frontend and backend
4. **Maintainability**: Centralized validation logic that's easy to update
5. **Reusability**: Middleware can be applied to any endpoint that needs validation

## Future Enhancements

- Add rate limiting validation
- Add custom validation rules for specific business logic
- Add validation for file uploads
- Add internationalization for error messages


