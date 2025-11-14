# Render.com Deployment Guide

This guide will help you deploy your casino backend application to Render.com.

## Prerequisites

1. A Render.com account
2. A PostgreSQL database (you can use Render's managed PostgreSQL or external database)
3. All required environment variables configured

## Step 1: Prepare Your Repository

1. Make sure your code is pushed to a Git repository (GitHub, GitLab, or Bitbucket)
2. Ensure all files are committed and pushed to your main branch

## Step 2: Create a New Web Service on Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" and select "Web Service"
3. Connect your Git repository
4. Configure the service with the following settings:

### Service Configuration

- **Name**: `casino-back` (or your preferred name)
- **Runtime**: `Node`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Health Check Path**: `/health`

### Important Notes

- The build process includes TypeScript compilation
- Prisma client is automatically generated during the build
- Security vulnerabilities have been addressed
- All TypeScript compilation errors have been fixed

### Environment Variables

Set the following environment variables in your Render dashboard:

#### Required Variables
```
DATABASE_URL=postgresql://username:password@host:port/database
JWTPRIVATEKEY=your_jwt_private_key_here
NODE_ENV=production
PORT=4000
```

#### Email Configuration
```
RESEND_API_KEY=your_resend_api_key_here
RESEND_FROM=OK777 <no-reply@ok777.io>
```

#### Google OAuth (if using)
```
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=https://your-app.onrender.com/api/v1/users/auth/google/callback
GOOGLE_OAUTH_REDIRECT_FRONTEND=https://your-frontend-domain.com
FRONTEND_URL=https://your-frontend-domain.com
```

#### Blockchain Configuration (if using)
```
TRON_FULLNODE=https://nile.trongrid.io
TRON_MAIN_POOL_ADDRESS=your_tron_main_pool_address
TRON_MAIN_POOL_PK=your_tron_main_pool_private_key
TRON_USDT_CONTRACT=your_tron_usdt_contract_address
```

#### Game Configuration
```
ODDS_NUMERATOR=1
ODDS_DENOMINATOR=2
FEE_NUMERATOR=1
FEE_DENOMINATOR=100
```

#### Feature Flags
```
ENABLE_TRON_WATCHERS=false
ENABLE_ETH_WATCHERS=false
ENABLE_SOL_WATCHERS=false
ENABLE_GAMES=false
```

#### Seamless API Configuration
```
OPERATOR_CODE=your_operator_code
SECRET_KEY=your_secret_key
```

#### Supabase Configuration (if using)
```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Step 3: Database Setup

### Option A: Use Render's Managed PostgreSQL
1. Create a new PostgreSQL database in Render
2. Copy the connection string to your `DATABASE_URL` environment variable
3. Run database migrations after deployment

### Option B: Use External Database
1. Set up your external PostgreSQL database
2. Configure the `DATABASE_URL` environment variable with your database connection string

## Step 4: Deploy

1. Click "Create Web Service"
2. Render will automatically build and deploy your application
3. Monitor the build logs for any issues
4. Once deployed, your application will be available at `https://your-app-name.onrender.com`

## Step 5: Database Migration

After successful deployment, you may need to run database migrations:

1. Connect to your Render service via SSH or use the Render shell
2. Run: `npx prisma db push` or `npx prisma migrate deploy`

## Step 6: Verify Deployment

1. Check the health endpoint: `https://your-app-name.onrender.com/health`
2. Test your API endpoints
3. Check the application logs in the Render dashboard

## Troubleshooting

### Common Issues

1. **Build Failures**: Check that all dependencies are properly listed in `package.json`
2. **Database Connection Issues**: Verify your `DATABASE_URL` is correct
3. **Environment Variables**: Ensure all required variables are set
4. **Memory Issues**: Consider upgrading to a higher plan if you encounter memory errors

### Logs

- View build logs in the Render dashboard
- Check application logs for runtime errors
- Monitor the health check endpoint

## Scaling

- Start with the Starter plan
- Upgrade to higher plans as needed
- Consider using Render's auto-scaling features for production

## Security Notes

- Never commit sensitive environment variables to your repository
- Use Render's environment variable management for secrets
- Consider using Render's private networking for database connections
- Enable SSL/TLS for all external connections

## Support

- Render Documentation: https://render.com/docs
- Render Community: https://community.render.com
- Application-specific issues: Check your application logs and error messages
