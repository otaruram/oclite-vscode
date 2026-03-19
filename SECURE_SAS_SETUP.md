# 🔒 Secure SAS Token Setup for OCLite

This guide helps you implement secure, short-lived SAS tokens for your OCLite VS Code extension, replacing the insecure long-lived SAS URLs.

## 🚨 Security Issue Fixed

**Before (Insecure):**
- SAS tokens with `sp=rwdlacup` (full permissions)
- Expiry set to year 2030 (6+ years!)
- Single token for all operations

**After (Secure):**
- SAS tokens with `sp=r` (read-only)
- Expiry set to 1 hour
- Fresh tokens generated on-demand

## 🏗️ Implementation Options

### Option 1: Backend API (Recommended)

Deploy the Python backend API to generate secure SAS tokens:

1. **Deploy the Backend API:**
   ```bash
   # Use the provided backend-example/secure_sas_api.py
   # Deploy to Azure Functions, App Service, or your preferred platform
   ```

2. **Set Environment Variables:**
   ```bash
   AZURE_STORAGE_ACCOUNT_NAME=your_storage_account
   AZURE_STORAGE_ACCOUNT_KEY=your_account_key
   SECURE_SAS_API_URL=https://your-backend-api.azurewebsites.net
   ```

3. **Update VS Code Extension:**
   - The extension will automatically use the secure URL service
   - Fallback to original URLs if service is unavailable

### Option 2: Client-Side Generation (Alternative)

If you prefer client-side generation (less secure but simpler):

1. **Add Storage Credentials to Secrets:**
   ```typescript
   // Add to src/utilities/secrets.ts
   const _ENC_STORAGE_ACCOUNT_KEY = [/* XOR encoded key */];
   ```

2. **Use the secureBlobAccess.ts Service:**
   - Already implemented in your codebase
   - Generates tokens client-side

## 🔧 Configuration Steps

### 1. Backend API Setup

```python
# Install dependencies
pip install azure-storage-blob flask

# Set environment variables
export AZURE_STORAGE_ACCOUNT_NAME="your_storage_account"
export AZURE_STORAGE_ACCOUNT_KEY="your_account_key"

# Run the API
python backend-example/secure_sas_api.py
```

### 2. VS Code Extension Configuration

```typescript
// In your environment or build process
process.env.SECURE_SAS_API_URL = 'https://your-backend-api.azurewebsites.net';
```

### 3. Test the Implementation

```bash
# Test single image URL generation
curl -X POST https://your-backend-api.azurewebsites.net/api/secure-image-url \
  -H "Content-Type: application/json" \
  -d '{"blob_name": "users/123/test-image.png"}'

# Test batch URL generation
curl -X POST https://your-backend-api.azurewebsites.net/api/secure-gallery-urls \
  -H "Content-Type: application/json" \
  -d '{"blob_names": ["users/123/image1.png", "users/123/image2.png"]}'
```

## 🛡️ Security Benefits

1. **✅ Principle of Least Privilege:** Read-only access only
2. **✅ Time-Limited Access:** 1-hour expiry prevents long-term abuse
3. **✅ Fresh Tokens:** New tokens generated for each request
4. **✅ Clock Skew Protection:** Tokens start 5 minutes early
5. **✅ Audit Trail:** Full logging and telemetry
6. **✅ Graceful Fallback:** Works even if secure service is down

## 📊 Monitoring

The implementation includes comprehensive telemetry:

- `secure_url.single.success` - Single URL generation success
- `secure_url.batch.success` - Batch URL generation success  
- `secure_url.single.error` - Single URL generation errors
- `secure_url.batch.error` - Batch URL generation errors
- `blob.gallery.secure_url_error` - Service integration errors

## 🚀 Deployment Checklist

- [ ] Deploy backend API to Azure Functions/App Service
- [ ] Set environment variables for storage credentials
- [ ] Update VS Code extension configuration
- [ ] Test single image URL generation
- [ ] Test batch gallery URL generation
- [ ] Verify fallback behavior when service is down
- [ ] Monitor telemetry for errors
- [ ] Update documentation for users

## 🔄 Migration Path

1. **Phase 1:** Deploy backend API alongside existing system
2. **Phase 2:** Update VS Code extension to use secure URLs
3. **Phase 3:** Monitor and verify secure URL generation
4. **Phase 4:** Remove old insecure SAS URL (optional)

The implementation includes automatic fallback, so users won't experience disruption during migration.

## 🆘 Troubleshooting

**Issue:** Secure URLs not generating
- Check backend API health endpoint
- Verify environment variables
- Check network connectivity

**Issue:** Images not loading in gallery
- Check browser console for CORS errors
- Verify SAS token permissions
- Check token expiry times

**Issue:** Performance concerns
- Implement caching in backend API
- Use batch URL generation for galleries
- Monitor API response times