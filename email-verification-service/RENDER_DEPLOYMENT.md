# Render.com Deployment Configuration

## Build Command
```bash
npm install
```

## Start Command
```bash
npm start
```

## Environment Variables
Set these in your Render dashboard:

```
RESEND_API_KEY=your_resend_api_key_here
PORT=3000
NODE_ENV=production
```

## Render Service Settings
- **Runtime**: Node.js
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Port**: 3000
- **Auto-Deploy**: Yes (from main branch)

## Domain Configuration
- **Custom Domain**: Configure your domain to point to Render
- **SSL**: Automatically provided by Render
- **Health Check**: Uses `/health` endpoint

## Monitoring
- **Logs**: Available in Render dashboard
- **Metrics**: Built-in monitoring
- **Alerts**: Configure based on your needs

## Scaling
- **Instance Type**: Start with Starter plan
- **Auto-scaling**: Available on higher plans
- **Database**: Consider external database for production
