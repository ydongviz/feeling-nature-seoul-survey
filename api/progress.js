import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

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
                error: 'Server configuration error - missing AWS credentials'
            });
            return;
        }

        console.log('=== S3 LIST OBJECTS ATTEMPT ===');
        console.log('Bucket:', AWS_BUCKET_NAME);

        const params = { Bucket: AWS_BUCKET_NAME, Prefix: "raw/" };

        const s3 = new S3Client({
            region: AWS_REGION, 
            credentials: AWS_Credentials,
            requestHandler: {
                requestTimeout: 30000,
                httpsAgent: { timeout: 30000 }
            }
        });

        console.log('Sending ListObjectsV2Command...');

        // Fixed: Get all objects using pagination
        let total = 0;
        let contents = [];
        let token;

        do {
            const response = await s3.send(new ListObjectsV2Command({ 
                ...params, 
                ContinuationToken: token 
            }));
            
            total += response.KeyCount || 0;
            if (response.Contents) {
                contents.push(...response.Contents);
            }
            token = response.IsTruncated ? response.NextContinuationToken : undefined;
        } while (token);

        console.log('=== S3 RESPONSE SUCCESS ===');
        console.log('Total objects found:', total);
        console.log('Contents count:', contents.length);

        // Return data in the format your frontend expects
        res.status(200).json({
            Contents: contents,
            totalCount: total,
            bucket: AWS_BUCKET_NAME,
            prefix: "raw/"
        });

    } catch (error) {
        console.error('=== PROGRESS ERROR ===');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);

        // Return error details
        res.status(500).json({ 
            error: 'Failed to list S3 objects',
            details: error.message,
            errorType: error.constructor.name,
            timestamp: new Date().toISOString(),
            requiredPermission: 's3:ListBucket',
            bucket: AWS_BUCKET_NAME
        });
    }
}