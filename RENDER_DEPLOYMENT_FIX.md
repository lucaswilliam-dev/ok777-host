    # Render.com Deployment Fix

    ## Problem

    Error: `Cannot find module '/opt/render/project/src/dist/index.js'`

    The error shows Render is looking for the file in `src/dist/` but TypeScript outputs to `dist/` at the root.

    ## Root Cause

    This typically happens when:
    1. **Root Directory** setting in Render dashboard is set to `src` instead of `/` (project root)
    2. The build output isn't where we expect

    ## Solution

    ### Option 1: Fix Root Directory in Render Dashboard (Recommended)

    1. Go to your Render dashboard → **Web Service** → **Settings**
    2. Look for **Root Directory** field
    3. Make sure it's **empty** or set to `/` (not `src`)
    4. Save and redeploy

    ### Option 2: Updated render.yaml

    The `render.yaml` has been updated to use `npm run start:dist` which should work regardless of directory.

    ### Option 3: Verify Build Output

    If the issue persists, the build might not be creating `dist/index.js` correctly. Check build logs to see if TypeScript compiled successfully.

    ## Updated Configuration

    ```yaml
    services:
    - type: web
        name: casino-back
        env: node
        plan: starter
        buildCommand: npm install && npm run build
        startCommand: npm run start:dist
        healthCheckPath: /health
        envVars:
        - key: NODE_ENV
            value: production
        autoDeploy: true
    ```

    ## Verification Steps

    1. Check Render dashboard **Settings** → **Root Directory** (should be empty)
    2. Check build logs to verify `dist/` folder was created
    3. Verify TypeScript compilation succeeded
    4. Check that `dist/index.js` exists in build output

    ## If Still Not Working

    If the issue persists, try these alternative start commands in Render dashboard:

    **Option A:** Use absolute path (if project root is known)
    ```bash
    node /opt/render/project/dist/index.js
    ```

    **Option B:** Use npm script
    ```bash
    npm run start:dist
    ```

    **Option C:** Change directory first
    ```bash
    cd /opt/render/project && node dist/index.js
    ```

    ## Expected File Structure

    After build, you should have:
    ```
    /opt/render/project/
    ├── dist/
    │   └── index.js        ← This is what we need
    ├── src/
    │   └── index.ts
    ├── package.json
    └── tsconfig.json
    ```

    If Root Directory is set to `src`, then commands run from:
    ```
    /opt/render/project/src/
    ```
    And it looks for `dist/index.js` relative to `src/`, which would be `src/dist/index.js` (wrong location).

    ## Next Steps

    1. ✅ Updated `render.yaml` with `npm run start:dist`
    2. Check Render dashboard for Root Directory setting
    3. Redeploy and verify build logs
    4. Check that `dist/index.js` is created during build

