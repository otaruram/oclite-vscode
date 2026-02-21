# 🔒 OCLite Security & Authentication Guide

## 🚀 New Security Features Implemented

### 1. **Microsoft Authentication Integration** 👤
- **Purpose**: Secure user identification and cloud access
- **Features**:
  - Sign in with Microsoft account
  - User session management 
  - Automatic blob storage initialization after auth
  - Session persistence across VS Code restarts

### 2. **User-Isolated Cloud Storage** 🗂️
- **Isolation**: Each user gets their own folder structure in blob storage
- **Privacy**: Images are organized by user identity
- **Path Structure**: `users/{hashedUserId}/{timestamp}_{model}_{prompt}.png`
- **Security**: Only authenticated users can access their images

### 3. **Rate Limiting & Abuse Prevention** ⚡
- **Limits**: 10 requests per minute per user
- **Prevention**: Protects against excessive usage and API abuse  
- **User-Friendly**: Clear messages showing remaining quota
- **Telemetry**: Tracks usage patterns for optimization

### 4. **Encrypted Connection String Storage** 🔐
- **Storage**: Connection strings stored in VS Code's secure settings
- **Encryption**: Automatically encrypted by VS Code's credential store
- **Prompt**: Interactive setup guide for first-time users
- **Fallback**: Local-only mode if cloud setup fails

## 📋 Available Commands

| Command | Description | Icon |
|---------|-------------|------|
| `OCLite: Sign in with Microsoft` | Authenticate with Microsoft account | `$(account)` |
| `OCLite: Sign Out` | Sign out and clear session | `$(sign-out)` |
| `OCLite: Configure Cloud Storage` | Set up Azure Storage connection | `$(cloud)` |
| `OCLite: View Rate Limit Status` | Check usage quota | `$(pulse)` |
| `OCLite: Clear Storage Settings` | Remove all cloud settings | `$(trash)` |
| `OCLite: View My Gallery` | Browse your cloud images | `$(images)` |

## 🛠️ Setup Instructions

### Step 1: Create Azure Storage Account
1. Go to [Azure Portal](https://portal.azure.com)
2. Create a Storage Account (pick unique name like `oclitestorage123`)
3. Copy the **Connection String** from "Access keys" section

### Step 2: Configure Extension
1. **Command Palette** → `OCLite: Configure Cloud Storage`
2. Paste your Azure connection string (will be encrypted)
3. **Command Palette** → `OCLite: Sign in with Microsoft`  
4. Authenticate with your Microsoft account

### Step 3: Start Using
- Generate images normally - they auto-upload to cloud
- Use `OCLite: View My Gallery` to browse all your images
- Share URLs directly from the gallery

## 🔧 Configuration Options

```json
{
    "oclite.blobStorage.autoUpload": true,        // Auto-upload generated images
    "oclite.blobStorage.maxImages": 100,          // Max gallery size  
    "oclite.auth.autoSignIn": false,              // Auto sign-in on startup
    "oclite.blobStorage.connectionString": "..."  // Encrypted connection string
}
```

## 🚨 Security Best Practices

### ✅ What We Do Right
- ✅ **No hardcoded credentials** in source code
- ✅ **User isolation** prevents cross-user access
- ✅ **Rate limiting** prevents abuse
- ✅ **Encrypted storage** of secrets in VS Code
- ✅ **Hashed user IDs** in logs for privacy
- ✅ **Telemetry anonymization** for user privacy
- ✅ **Error handling** with user-friendly messages

### 🔒 Privacy Protection  
- User emails/IDs are hashed before logging
- Only you can access your images 
- Connection strings encrypted by VS Code
- No sensitive data in extension source code
- Session tokens managed by VS Code auth system

### 💰 Cost Management
- **Storage**: $0.018/GB/month (practically free for images)
- **Transactions**: $0.0004/10,000 operations  
- **Rate limits**: Prevent unexpected Azure charges
- **Expected cost**: ~$1-2/month maximum for typical usage

## 🐛 Troubleshooting

### Authentication Issues
```
Problem: "Microsoft sign-in failed"
Solution: 
1. Check internet connection
2. Ensure Microsoft account access in VS Code settings
3. Try signing out and back in
4. Restart VS Code if needed
```

### Storage Issues
```
Problem: "Cloud storage setup failed" 
Solution:
1. Verify connection string format
2. Check Azure storage account permissions
3. Ensure storage account is active
4. Try re-entering connection string
```

### Rate Limiting
```
Problem: "Rate limit reached"
Solution:  
1. Wait for reset (shows countdown)
2. Check current limit: Command → "View Rate Limit Status"
3. Current limit: 10 uploads per minute
4. Limit resets automatically
```

## 🎯 Usage Examples

### Generate & Auto-Upload
```
1. Chat with @oclite: "generate a sunset landscape"
2. Image generates → automatically uploads to your cloud gallery  
3. Access via "OCLite: View My Gallery"
```

### Share Images  
```
1. Open gallery: "OCLite: View My Gallery"
2. Click "View Full Size" on any image
3. Copy URL to share with others
4. Images have public URLs for easy sharing  
```

### Manage Storage
```
# View your authentication status
Command: "OCLite: Sign in with Microsoft"

# Check your usage limits
Command: "OCLite: View Rate Limit Status"  

# Clear everything and start over
Command: "OCLite: Clear Storage Settings"
```

## 🌟 Benefits Summary

| Feature | Benefit |
|---------|---------|
| **Microsoft Auth** | Secure, familiar login process |
| **User Isolation** | Your images stay private |
| **Rate Limiting** | Prevents abuse & unexpected costs |
| **Auto-Upload** | Seamless cloud backup |
| **Public URLs** | Easy sharing capabilities |
| **Encrypted Settings** | Secure credential storage |
| **Telemetry & Monitoring** | Usage insights & error tracking |

---

**🔐 Security Status**: ✅ Enterprise-ready with Microsoft authentication, user isolation, rate limiting, and encrypted credential storage.

**💡 Next Steps**: 
1. ✅ Create Azure Storage Account
2. ✅ Configure extension with connection string  
3. ✅ Sign in with Microsoft account
4. 🎨 Start generating & uploading images!