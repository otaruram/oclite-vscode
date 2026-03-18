# 🚨 AZURE FUNCTION QUICK FIX GUIDE

## Current Status: HTTP 500 Error
Your Azure Function is returning HTTP 500 for all requests with empty response body.

## 🛠️ IMMEDIATE SOLUTION

### Step 1: Deploy Fixed Files
Copy these files to your Azure Function:

```
azure-function-files/
├── package.json                    # ✅ With replicate dependency
├── host.json                       # ✅ Function app configuration  
├── HttpTrigger1/
│   ├── function.json               # ✅ Trigger configuration
│   └── index.js                    # ✅ Fixed function code
└── local.settings.json             # ✅ For local testing
```

### Step 2: Install Dependencies
In your Azure Function root directory:
```bash
npm install
```

### Step 3: Configure Environment Variable
In Azure Portal:
1. Go to Function App → Configuration → Application Settings
2. Add/Update:
   - **Name**: `OCLITE-GENERATE`
   - **Value**: `[YOUR_REPLICATE_API_TOKEN_HERE]`

### Step 4: Deploy
Using Azure Functions Core Tools:
```bash
func azure functionapp publish your-function-app-name
```

Or using VS Code Azure Functions extension.

### Step 5: Restart Function App
In Azure Portal:
1. Go to Function App → Overview
2. Click "Restart"
3. Wait for restart to complete

## 🧪 TESTING AFTER FIX

Run these tests to verify:

```bash
# Health check
node test-health-check.js

# Full generation test  
node test-azure-function.js
```

## 📋 EXPECTED RESULTS AFTER FIX

### Health Check (GET):
```json
{
  "status": "healthy",
  "message": "OCLite Azure Function is running",
  "timestamp": "2026-03-18T09:35:00.000Z",
  "version": "1.0.0"
}
```

### Image Generation (POST):
```json
{
  "status": "succeeded",
  "images": ["https://replicate.delivery/..."],
  "model": "bytedance/sdxl-lightning-4step",
  "prompt": "your prompt here",
  "duration_ms": 3500
}
```

## 🆘 IF STILL FAILING

1. Check Azure Portal logs:
   - Function App → Functions → HttpTrigger1 → Monitor
   - Look for detailed error messages

2. Verify deployment:
   - Function App → Functions → HttpTrigger1 → Code + Test
   - Check if files are properly deployed

3. Check environment variables:
   - Function App → Configuration → Application Settings
   - Verify OCLITE-GENERATE is set

## 📞 SUPPORT

If issues persist, share:
1. Azure Portal error logs
2. Deployment method used
3. Current file structure in Azure Function