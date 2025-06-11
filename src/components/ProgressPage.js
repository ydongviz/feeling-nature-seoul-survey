import {React} from "react";
import axios from "axios";
import {useEffect, useState} from "react";

export const CITY_HASH = {
    'sel': "Seoul",   
    'ams': "Amsterdam",
    'bcn': "Barcelona",
    'bue': "Buenos Aires",
    'dxb': "Dubai",
    "que": "Québec City",
    "nai": "Nairobi",
    "sin": "Singapore",
    "tro": "Trondheim",
}

export const ProgressPage = () => {
    // Report the progress so far in the S3 buckets.
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchData = () => {
        setLoading(true);
        // Send request to the endpoint /api/progress, and after fetching the JSON, display the information.
        axios.get('/api/progress').then((response) => {
            // console.log(response);
            const _data = response.data;
            let progressData = {
                'totalSubmit': 0,
                'totalByType': {},
            };
            for (const key of Object.keys(CITY_HASH)) {
                const city_name = CITY_HASH[key];
                progressData['totalByType'][city_name] = 0;
            }

            if (!('Contents' in _data)) {
                setData(progressData);
                setLoading(false);
                return;
            }

            const _contents = _data['Contents'];

            // Filter _contents such that only keys that does not start with `_` will remain
            const contents = _contents.filter((content) => {
                return !content['Key'].startsWith('_')
            });

            progressData['totalSubmit'] = contents.length;

            // Then, for each type, count the number of submissions.
            for (const content of contents) {
                const _key = content['Key'];
                const city_acronym = _key.split('_')[0];
                if (city_acronym in CITY_HASH) {
                    const city_name = CITY_HASH[city_acronym];
                    progressData['totalByType'][city_name] += 1;
                }
            }

            setData(progressData);
            setLoading(false);
        }).catch((error) => {
            console.log(error);
            setLoading(false);
        });
    }
    useEffect(fetchData, []);

    return (<div>
            {loading ? (<div>Loading...</div>) : (<div>
                <h1>Progress</h1>
                <div>Total Submission: {data['totalSubmit'] || 0}</div>
                <div>
                    <h1>Categorize by city name</h1>
                    {
                        Object.keys(data['totalByType']).map((key) => {
                            return (<div key={key}>{key}: {data['totalByType'][key] || 0}</div>)
                        })
                    }
                </div>
            </div>)}
        </div>
    );

}