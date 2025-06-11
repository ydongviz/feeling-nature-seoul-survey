import {Upload} from "@aws-sdk/lib-storage";
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
    // List all keys in the bucket.
    try {
        const params = {
            Bucket: AWS_BUCKET_NAME,
        };
        const s3 = new S3Client({region: AWS_REGION, credentials: AWS_Credentials});
        const response = await s3.send(new ListObjectsCommand(params));
        console.log(response);
        res.status(200).send(response);
    } catch (error) {
        console.error(`Error uploading.`, error);
        res.status(500).send(`Internal Error Occurs`);
    }

}