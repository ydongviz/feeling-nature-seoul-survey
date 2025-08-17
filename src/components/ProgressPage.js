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
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchData = () => {
        setLoading(true);
        setError(null);
        
        // Send request to the endpoint /api/progress
        axios.get('/api/progress')
            .then((response) => {
                console.log('Progress API response:', response);
                const _data = response.data;
                
                let progressData = {
                    'totalSubmit': 0,
                    'totalByType': {},
                };

                // Initialize city counts
                for (const key of Object.keys(CITY_HASH)) {
                    const city_name = CITY_HASH[key];
                    progressData['totalByType'][city_name] = 0;
                }

                // Check if response has Contents
                if (!_data || !('Contents' in _data) || !_data.Contents) {
                    console.log('No Contents in response, using empty data');
                    setData(progressData);
                    setLoading(false);
                    return;
                }

                const _contents = _data['Contents'];
                console.log('Found Contents:', _contents.length, 'items');

                // Filter contents to exclude keys starting with '_'
                const contents = _contents.filter((content) => {
                    return content.Key && !content.Key.startsWith('_');
                });

                console.log('Filtered Contents:', contents.length, 'items');
                progressData['totalSubmit'] = contents.length;

                // Count submissions by city
                for (const content of contents) {
                    const _key = content['Key'];
                    if (_key) {
                        const city_acronym = _key.split('_')[0];
                        if (city_acronym in CITY_HASH) {
                            const city_name = CITY_HASH[city_acronym];
                            progressData['totalByType'][city_name] += 1;
                        }
                    }
                }

                console.log('Final progress data:', progressData);
                setData(progressData);
                setLoading(false);
            })
            .catch((error) => {
                console.error('Progress API error:', error);
                console.error('Error response:', error.response);
                
                // Set error state
                setError({
                    message: error.message,
                    status: error.response?.status,
                    data: error.response?.data
                });
                
                // Set empty data to prevent null access
                const emptyProgressData = {
                    'totalSubmit': 0,
                    'totalByType': {},
                };
                for (const key of Object.keys(CITY_HASH)) {
                    const city_name = CITY_HASH[key];
                    emptyProgressData['totalByType'][city_name] = 0;
                }
                setData(emptyProgressData);
                setLoading(false);
            });
    };

    useEffect(fetchData, []);

    return (
        <div>
            {loading ? (
                <div>Loading progress data...</div>
            ) : (
                <div>
                    <h1>Progress</h1>
                    
                    {/* Show error if exists */}
                    {error && (
                        <div style={{
                            backgroundColor: '#ffebee',
                            color: '#c62828',
                            padding: '10px',
                            marginBottom: '20px',
                            borderRadius: '4px',
                            border: '1px solid #e57373'
                        }}>
                            <h3>Error Loading Progress Data</h3>
                            <p><strong>Message:</strong> {error.message}</p>
                            {error.status && <p><strong>Status:</strong> {error.status}</p>}
                            {error.data && (
                                <details>
                                    <summary>Error Details</summary>
                                    <pre>{JSON.stringify(error.data, null, 2)}</pre>
                                </details>
                            )}
                            <button 
                                onClick={fetchData}
                                style={{
                                    marginTop: '10px',
                                    padding: '5px 10px',
                                    backgroundColor: '#1976d2',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }}
                            >
                                Retry
                            </button>
                        </div>
                    )}

                    {/* Show data (with null safety) */}
                    <div>Total Submission: {data?.totalSubmit || 0}</div>
                    
                    <div>
                        <h2>Categorize by city name</h2>
                        {data?.totalByType ? (
                            Object.keys(data.totalByType).map((key) => {
                                return (
                                    <div key={key}>
                                        {key}: {data.totalByType[key] || 0}
                                    </div>
                                );
                            })
                        ) : (
                            <div>No city data available</div>
                        )}
                    </div>

                    {/* Debug information */}
                    <div style={{
                        marginTop: '30px',
                        padding: '15px',
                        backgroundColor: '#f5f5f5',
                        borderRadius: '4px',
                        fontSize: '12px'
                    }}>
                        <h3>Debug Information</h3>
                        <p><strong>Data loaded:</strong> {data ? 'Yes' : 'No'}</p>
                        <p><strong>Loading state:</strong> {loading.toString()}</p>
                        <p><strong>Error state:</strong> {error ? 'Yes' : 'No'}</p>
                        <p><strong>API endpoint:</strong> /api/progress</p>
                        <p><strong>Last updated:</strong> {new Date().toLocaleString()}</p>
                        
                        {data && (
                            <details style={{marginTop: '10px'}}>
                                <summary>Raw Data</summary>
                                <pre>{JSON.stringify(data, null, 2)}</pre>
                            </details>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};