import {React} from "react";
import axios from "axios";
import {useEffect, useState} from "react";

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
                    'seoulOnly': true
                };

                // Check if response has Contents
                if (!_data || !('Contents' in _data) || !_data.Contents) {
                    console.log('No Contents in response, using empty data');
                    setData(progressData);
                    setLoading(false);
                    return;
                }

                const _contents = _data['Contents'];
                console.log('Found Contents:', _contents.length, 'items');

                // Filter contents to exclude contact forms and other non-survey data
                const contents = _contents.filter((content) => {
                    return content.Key && 
                           !content.Key.startsWith('_') && 
                           !content.Key.startsWith('__contact_') &&
                           content.Key.startsWith('sel_'); // Only Seoul surveys
                });

                console.log('Filtered Seoul survey contents:', contents.length, 'items');
                progressData['totalSubmit'] = contents.length;

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
                    'seoulOnly': true
                };
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
                    <h1>Seoul Survey Progress</h1>
                    
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
                    <div>
                        <h2>Seoul Survey Progress</h2>
                        <div style={{fontSize: '24px', fontWeight: 'bold', color: '#2e7d32', margin: '20px 0'}}>
                            Total Submissions: {data?.totalSubmit || 0}
                        </div>
                        <p style={{color: '#666', fontSize: '14px'}}>
                            All survey responses are from Seoul residents or people familiar with Seoul.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};