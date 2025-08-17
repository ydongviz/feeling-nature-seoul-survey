import {ListObjectsCommand, S3Client} from "@aws-sdk/client-s3";

const {
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    AWS_REGION,
    AWS_BUCKET_NAME
} = process.env;

const AWS_Credentials = {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY
};

export default async function handler(req, res) {
    console.log('=== PROGRESS REQUEST DEBUG ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Method:', req.method);
    console.log('Environment variables check:');
    console.log('- AWS_ACCESS_KEY_ID exists:', !!AWS_ACCESS_KEY_ID);
    console.log('- AWS_SECRET_ACCESS_KEY exists:', !!AWS_SECRET_ACCESS_KEY);
    console.log('- AWS_REGION:', AWS_REGION);
    console.log('- AWS_BUCKET_NAME:', AWS_BUCKET_NAME);

    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight request
    if (req.method === 'OPTIONS') {
        console.log('Handling OPTIONS preflight request');
        res.status(200).end();
        return;
    }

    // Only allow GET requests
    if (req.method !== 'GET') {
        console.log('Invalid method for progress:', req.method);
        res.status(405).json({ 
            error: 'Method not allowed', 
            allowedMethods: ['GET'],
            receivedMethod: req.method 
        });
        return;
    }

    try {
        // Check environment variables
        if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_REGION || !AWS_BUCKET_NAME) {
            console.error('Missing AWS environment variables for progress');
            res.status(500).json({ 
                error: 'Server configuration error - missing AWS credentials',
                missingVars: {
                    accessKey: !AWS_ACCESS_KEY_ID,
                    secretKey: !AWS_SECRET_ACCESS_KEY,
                    region: !AWS_REGION,
                    bucket: !AWS_BUCKET_NAME
                }
            });
            return;
        }

        console.log('=== S3 LIST OBJECTS ATTEMPT ===');
        console.log('Bucket:', AWS_BUCKET_NAME);
        console.log('Region:', AWS_REGION);

        const params = {
            Bucket: AWS_BUCKET_NAME,
        };

        const s3 = new S3Client({
            region: AWS_REGION, 
            credentials: AWS_Credentials,
            // Add request timeout
            requestHandler: {
                requestTimeout: 30000,
                httpsAgent: { timeout: 30000 }
            }
        });

        console.log('Sending ListObjectsCommand...');
        const response = await s3.send(new ListObjectsCommand(params));
        
        console.log('=== S3 RESPONSE SUCCESS ===');
        console.log('Response metadata:', response.$metadata);
        console.log('Contents count:', response.Contents ? response.Contents.length : 0);
        console.log('IsTruncated:', response.IsTruncated);

        // Log first few keys for debugging
        if (response.Contents && response.Contents.length > 0) {
            console.log('First 3 keys:', response.Contents.slice(0, 3).map(item => item.Key));
        }

        res.status(200).json(response);

    } catch (error) {
        console.error('=== PROGRESS ERROR ===');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Error code:', error.code || error.Code);
        console.error('Error stack:', error.stack);

        // AWS specific error handling
        if (error.name === 'AccessDenied' || error.Code === 'AccessDenied') {
            console.error('AWS Access Denied for ListObjects');
            console.error('Required permission: s3:ListBucket');
            console.error('Bucket:', AWS_BUCKET_NAME);
            console.error('Make sure IAM policy includes s3:ListBucket permission');
        }

        if (error.$metadata) {
            console.error('AWS Error Metadata:', error.$metadata);
        }

        // Return error details
        res.status(500).json({ 
            error: 'Failed to list S3 objects',
            details: error.message,
            errorType: error.constructor.name,
            errorCode: error.code || error.Code,
            timestamp: new Date().toISOString(),
            requiredPermission: 's3:ListBucket',
            bucket: AWS_BUCKET_NAME,
            awsError: error.$metadata ? {
                httpStatusCode: error.$metadata.httpStatusCode,
                requestId: error.$metadata.requestId,
                attempts: error.$metadata.attempts
            } : null
        });
    }
}