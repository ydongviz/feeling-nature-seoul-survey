import {React} from "react";
import axios from "axios";
import {useEffect, useState} from "react";


export const ProgressPage = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchData = () => {
        setLoading(true);
        
        // Send request to the endpoint /api/progress
        axios.get('/api/progress')
            .then((response) => {
                const _data = response.data;
                
                let progressData = {
                    'totalSubmit': 0,
                    'seoulOnly': true
                };

                // Check if response has Contents
                if (!_data || !('Contents' in _data) || !_data.Contents) {
                    setData(progressData);
                    setLoading(false);
                    return;
                }

                const _contents = _data['Contents'];

                // Filter contents to exclude contact forms and other non-survey data
                const contents = _contents.filter((content) => {
                    if (!content.Key) return false;
                    
                    const key = content.Key;
                    const isPrivate = key.startsWith('_');
                    const isContact = key.startsWith('__contact_');
                    
                    // Look for survey data (not contact forms)
                    return key.startsWith('raw/sel_') || (!isPrivate && !isContact && key.startsWith('sel_'));
                });

                progressData['totalSubmit'] = contents.length;
                setData(progressData);
                setLoading(false);
            })
            .catch((error) => {
                // Log the error instead of storing it
                console.error('Error fetching progress:', error.message);
                
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
        <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
            {loading ? (
                <div style={{ fontSize: '18px', color: '#1976d2' }}>
                    Loading progress data...
                </div>
            ) : (
                <div>
                    <h1>Seoul Survey Progress</h1>
                    


                    {/* Show data */}
                    <div style={{
                        backgroundColor: '#f8f9fa',
                        padding: '20px',
                        borderRadius: '8px',
                        border: '1px solid #dee2e6'
                    }}>
                        <div style={{fontSize: '32px', fontWeight: 'bold', color: '#2e7d32', margin: '0 0 15px 0'}}>
                            Total Submissions: {data?.totalSubmit || 0}
                        </div>
                        <p style={{color: '#666', fontSize: '16px', margin: '0'}}>
                            All survey responses are from Seoul residents or people familiar with Seoul.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};