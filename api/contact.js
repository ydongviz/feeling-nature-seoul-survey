import {Upload} from "@aws-sdk/lib-storage";
import {S3Client} from "@aws-sdk/client-s3";

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
    try {
        const _key = Object.keys(req.body)[0];
        const value = JSON.stringify(req.body[_key]);
        const key = `__contact_${_key}`;
        const params = {
            Bucket: AWS_BUCKET_NAME, Key: key, Body: value,
        };
        const uploader = new Upload({
            client: new S3Client({region: AWS_REGION, credentials: AWS_Credentials}), // replace with your AWS region
            params: params,
        });
        await uploader.done();
        console.log(`Uploaded or override ${key} successfully.`);
        res.status(200).send(key);
    } catch (error) {
        console.error(`Error uploading.`, error);
        res.status(500).send(`Internal Error Occurs`);
    }
}