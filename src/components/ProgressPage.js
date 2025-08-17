import {React} from "react";
import axios from "axios";
import {useEffect, useState} from "react";

// Updated for Seoul-only survey with age group breakdown
export const AGE_GROUPS = {
    '18-25': '18-25 years old',
    '26-40': '26-40 years old', 
    '41-55': '41-55 years old',
    '>55': 'Over 55 years old'
};

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
                    'totalByAgeGroup': {},
                    'totalByGender': {},
                    'seoulOnly': true
                };

                // Initialize age group counts
                for (const ageGroup of Object.keys(AGE_GROUPS)) {
                    progressData['totalByAgeGroup'][ageGroup] = 0;
                }

                // Initialize gender counts
                const genderGroups = ['Male', 'Female', 'Other', 'Prefer not to answer'];
                for (const gender of genderGroups) {
                    progressData['totalByGender'][gender] = 0;
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

                // Filter contents to exclude contact forms and other non-survey data
                const contents = _contents.filter((content) => {
                    return content.Key && 
                           !content.Key.startsWith('_') && 
                           !content.Key.startsWith('__contact_') &&
                           content.Key.startsWith('sel_'); // Only Seoul surveys
                });

                console.log('Filtered Seoul survey contents:', contents.length, 'items');
                progressData['totalSubmit'] = contents.length;

                // For demographic breakdown, we would need to fetch and parse each survey's content
                // This is a simplified version that just counts total submissions
                // To get actual demographic data, you'd need to:
                // 1. Fetch each survey's content from S3
                // 2. Parse the ageGroup and genderGroup fields
                // 3. Increment the appropriate counters

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
                    'totalByAgeGroup': {},
                    'totalByGender': {},
                    'seoulOnly': true
                };
                for (const ageGroup of Object.keys(AGE_GROUPS)) {
                    emptyProgressData['totalByAgeGroup'][ageGroup] = 0;
                }
                const genderGroups = ['Male', 'Female', 'Other', 'Prefer not to answer'];
                for (const gender of genderGroups) {
                    emptyProgressData['totalByGender'][gender] = 0;
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
                        <h2>Total Submissions: {data?.totalSubmit || 0}</h2>
                        <p>All survey responses are from Seoul residents or people familiar with Seoul.</p>
                    </div>
                    
                    <div>
                        <h3>Breakdown by Age Group</h3>
                        <p><em>Note: Demographic breakdown requires survey content analysis - currently showing structure only</em></p>
                        {data?.totalByAgeGroup ? (
                            Object.keys(AGE_GROUPS).map((ageGroup) => {
                                return (
                                    <div key={ageGroup} style={{margin: '5px 0'}}>
                                        <strong>{AGE_GROUPS[ageGroup]}:</strong> {data.totalByAgeGroup[ageGroup] || 0}
                                    </div>
                                );
                            })
                        ) : (
                            <div>No age group data available</div>
                        )}
                    </div>

                    <div>
                        <h3>Breakdown by Gender</h3>
                        <p><em>Note: Demographic breakdown requires survey content analysis - currently showing structure only</em></p>
                        {data?.totalByGender ? (
                            Object.keys(data.totalByGender).map((gender) => {
                                return (
                                    <div key={gender} style={{margin: '5px 0'}}>
                                        <strong>{gender}:</strong> {data.totalByGender[gender] || 0}
                                    </div>
                                );
                            })
                        ) : (
                            <div>No gender data available</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};