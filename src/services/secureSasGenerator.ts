/**
 * secureSasGenerator.ts — Generate proper read-only SAS tokens with 1-hour expiry.
 * 
 * This requires the storage account key to generate valid signatures.
 * For production security, the account key should be stored in Azure Key Vault
 * or provided via secure environment variables.
 */

import * as crypto from 'crypto';

interface SasOptions {
    accountName: string;
    accountKey: string;
    containerName: string;
    blobName: string;
    permissions: string; // 'r' for read-only
    expiryHours: number; // 1 for 1-hour expiry
}

/**
 * Generate a secure SAS URL with read-only permissions and short expiry.
 */
export function generateSecureBlobSasUrl(options: SasOptions): string {
    const { accountName, accountKey, containerName, blobName, permissions, expiryHours } = options;
    
    const now = new Date();
    const expiry = new Date(now.getTime() + expiryHours * 60 * 60 * 1000);
    
    // Format dates for SAS (ISO 8601 without milliseconds)
    const startTime = now.toISOString().slice(0, -5) + 'Z';
    const expiryTime = expiry.toISOString().slice(0, -5) + 'Z';
    
    // SAS parameters
    const sasParams = {
        sv: '2022-11-02', // API version
        sr: 'b',          // resource: blob
        sp: permissions,  // permissions: 'r' for read-only
        st: startTime,    // start time
        se: expiryTime,   // expiry time
        spr: 'https'      // protocol: HTTPS only
    };
    
    // Build canonical resource string
    const canonicalResource = `/blob/${accountName}/${containerName}/${blobName}`;
    
    // Build string to sign
    const stringToSign = [
        sasParams.sp,     // permissions
        sasParams.st,     // start time
        sasParams.se,     // expiry time
        canonicalResource, // canonical resource
        '',               // identifier (empty for ad-hoc SAS)
        '',               // IP range (empty)
        sasParams.spr,    // protocol
        sasParams.sv,     // version
        sasParams.sr,     // resource
        '',               // snapshot time (empty)
        '',               // encryption scope (empty)
        '',               // cache control (empty)
        '',               // content disposition (empty)
        '',               // content encoding (empty)
        '',               // content language (empty)
        ''                // content type (empty)
    ].join('\n');
    
    // Generate signature
    const signature = crypto
        .createHmac('sha256', Buffer.from(accountKey, 'base64'))
        .update(stringToSign, 'utf8')
        .digest('base64');
    
    // Build final SAS URL
    const sasQuery = new URLSearchParams({
        ...sasParams,
        sig: signature
    });
    
    return `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}?${sasQuery.toString()}`;
}

/**
 * Generate a secure SAS URL for gallery display (1-hour expiry, read-only).
 */
export function generateGalleryImageUrl(accountName: string, accountKey: string, blobName: string): string {
    return generateSecureBlobSasUrl({
        accountName,
        accountKey,
        containerName: 'oclite-gallery',
        blobName,
        permissions: 'r', // read-only
        expiryHours: 1    // 1 hour expiry
    });
}