# Azure Blob Storage Setup for OCLite

## Quick Setup (5 minutes)

### 1. Create Storage Account
1. Open [Azure Portal](https://portal.azure.com)
2. Click **"Create a resource"** → search **"Storage account"**
3. Fill form:
   - **Name**: `oclitestorage` (must be globally unique, jadi coba `oclitestorage123` kalau taken)
   - **Region**: `Canada Central` (same as your other resources)
   - **Performance**: `Standard`
   - **Redundancy**: `LRS` (cheapest option)
4. Click **Review + Create** → **Create**

### 2. Get Connection String
1. After creation, open the storage account
2. Go to **Security + networking** → **Access keys**
3. Under **Key1**, click **Show** next to **Connection string**
4. Copy the entire connection string

### 3. Update Code
Replace the `STORAGE_CONNECTION_STRING` in `src/services/blobStorage.ts`:
```typescript
const STORAGE_CONNECTION_STRING = 'DefaultEndpointsProtocol=https;AccountName=oclitestorage123;AccountKey=YOUR_KEY_HERE;EndpointSuffix=core.windows.net';
```

## Cost Estimate
- **Storage**: $0.018/GB/month (practically free for images)
- **Transactions**: $0.0004/10,000 operations
- **Bandwidth**: $0.087/GB outbound (viewing images)

For your usage scale: **~$1-2/month maximum**.

## Usage
After setup, users can:
- Generate images → automatically saved to cloud
- Run `OCLite: View My Gallery` → see all images in a grid
- Share image URLs directly from the gallery
- Access images from any device