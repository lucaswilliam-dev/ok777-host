import { Request, Response, NextFunction } from 'express'
import { validateSignupData, validateSigninData, validateTelegramData, validateUsernameData } from '../utils/validation'

// Validation middleware for signup
export const validateSignup = (req: Request, res: Response, next: NextFunction) => {
  const { email, password, referralCode } = req.body

  const validation = validateSignupData({ email, password, referralCode })
  
  if (!validation.isValid) {
    return res.status(400).json({
      message: 'Validation failed',
      code: 400,
      errors: validation.errors
    })
  }

  next()
}

// Validation middleware for signin
export const validateSignin = (req: Request, res: Response, next: NextFunction) => {
  const { email, password } = req.body

  const validation = validateSigninData({ email, password })
  
  if (!validation.isValid) {
    return res.status(400).json({
      message: 'Validation failed',
      code: 400,
      errors: validation.errors
    })
  }

  next()
}

// Validation middleware for telegram
export const validateTelegram = (req: Request, res: Response, next: NextFunction) => {
  const { telegram } = req.body

  const validation = validateTelegramData({ telegram })
  
  if (!validation.isValid) {
    return res.status(400).json({
      message: 'Validation failed',
      code: 400,
      errors: validation.errors
    })
  }

  next()
}

// Validation middleware for username
export const validateUsername = (req: Request, res: Response, next: NextFunction) => {
  const { username } = req.body

  const validation = validateUsernameData({ username })
  
  if (!validation.isValid) {
    return res.status(400).json({
      message: 'Validation failed',
      code: 400,
      errors: validation.errors
    })
  }

  next()
}


