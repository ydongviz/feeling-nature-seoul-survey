import {React} from "react";
import axios from "axios";
import {useEffect, useState} from "react";

export const ProgressPage = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [serverErrorDetails, setServerErrorDetails] = useState(null);

    const fetchData = () => {
        setLoading(true);
        setError(null);
        setServerErrorDetails(null);
        
        console.log('🚀 Making request to /api/progress');
        console.log('📍 Full URL:', window.location.origin + '/api/progress');
        
        // Send request to the endpoint /api/progress
        axios.get('/api/progress', {
            timeout: 30000,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        })
            .then((response) => {
                console.log('✅ Progress API response successful:', response);
                console.log('📊 Response status:', response.status);
                console.log('📋 Response headers:', response.headers);
                console.log('💾 Response data:', response.data);
                
                const _data = response.data;
                
                let progressData = {
                    'totalSubmit': 0,
                    'seoulOnly': true
                };

                // Check if response has Contents
                if (!_data || !('Contents' in _data) || !_data.Contents) {
                    console.log('⚠️ No Contents in response, using empty data');
                    console.log('🔍 Response structure:', Object.keys(_data || {}));
                    setData(progressData);
                    setLoading(false);
                    return;
                }

                const _contents = _data['Contents'];
                console.log('📦 Found Contents:', _contents.length, 'items');

                // Log first few items to see data structure
                if (_contents.length > 0) {
                    console.log('🔍 First 3 items:', _contents.slice(0, 3));
                }

                // Filter contents to exclude contact forms and other non-survey data
                const contents = _contents.filter((content) => {
                    const hasKey = content.Key;
                    const notPrivate = hasKey && !content.Key.startsWith('_');
                    const notContact = hasKey && !content.Key.startsWith('__contact_');
                    const isSeoul = hasKey && content.Key.startsWith('sel_');
                    
                    if (hasKey) {
                        console.log(`🏷️ Processing: ${content.Key} | Private: ${!notPrivate} | Contact: ${!notContact} | Seoul: ${isSeoul}`);
                    }
                    
                    return hasKey && notPrivate && notContact && isSeoul;
                });

                console.log('✨ Filtered Seoul survey contents:', contents.length, 'items');
                if (contents.length > 0) {
                    console.log('📋 Sample filtered keys:', contents.slice(0, 5).map(c => c.Key));
                }
                
                progressData['totalSubmit'] = contents.length;
                progressData['rawTotal'] = _contents.length;

                console.log('🎯 Final progress data:', progressData);
                setData(progressData);
                setLoading(false);
            })
            .catch((error) => {
                console.error('❌ Progress API error:', error);
                console.error('📊 Error status:', error.response?.status);
                console.error('💥 Error response:', error.response);
                console.error('🔍 Error message:', error.message);
                console.error('⚙️ Error config:', error.config);
                
                // Extract detailed server error information
                let serverDetails = null;
                if (error.response && error.response.data) {
                    console.error('🚨 Server error data:', error.response.data);
                    serverDetails = {
                        status: error.response.status,
                        statusText: error.response.statusText,
                        data: error.response.data,
                        headers: error.response.headers
                    };
                }
                
                setServerErrorDetails(serverDetails);
                
                // Set error state
                setError({
                    message: error.message,
                    status: error.response?.status,
                    data: error.response?.data,
                    type: error.response ? 'server_error' : error.request ? 'network_error' : 'request_error'
                });
                
                // Set empty data to prevent null access
                const emptyProgressData = {
                    'totalSubmit': 0,
                    'seoulOnly': true,
                    'hasError': true
                };
                setData(emptyProgressData);
                setLoading(false);
            });
    };

    useEffect(fetchData, []);

    return (
        <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
            {loading ? (
                <div style={{ fontSize: '18px', color: '#1976d2' }}>
                    Loading progress data...
                </div>
            ) : (
                <div>
                    <h1>Seoul Survey Progress</h1>
                    
                    {/* Show error if exists */}
                    {error && (
                        <div style={{
                            backgroundColor: '#ffebee',
                            color: '#c62828',
                            padding: '15px',
                            marginBottom: '20px',
                            borderRadius: '8px',
                            border: '2px solid #e57373'
                        }}>
                            <h3 style={{ margin: '0 0 15px 0' }}>🚨 API Error Detected</h3>
                            
                            <div style={{ marginBottom: '10px' }}>
                                <strong>Error Type:</strong> {error.type}
                            </div>
                            <div style={{ marginBottom: '10px' }}>
                                <strong>Message:</strong> {error.message}
                            </div>
                            {error.status && (
                                <div style={{ marginBottom: '10px' }}>
                                    <strong>HTTP Status:</strong> {error.status}
                                </div>
                            )}
                            
                            {error.status === 500 && (
                                <div style={{
                                    backgroundColor: '#fff3e0',
                                    color: '#ef6c00',
                                    padding: '10px',
                                    borderRadius: '4px',
                                    margin: '10px 0',
                                    border: '1px solid #ffb74d'
                                }}>
                                    <strong>🔧 500 Internal Server Error:</strong><br/>
                                    This means there's a problem with your backend API endpoint. Common causes:
                                    <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                                        <li>API endpoint doesn't exist or isn't deployed</li>
                                        <li>Database connection issues</li>
                                        <li>Server configuration problems</li>
                                        <li>Missing environment variables</li>
                                        <li>Code errors in the API handler</li>
                                    </ul>
                                </div>
                            )}
                            
                            {serverErrorDetails && (
                                <details style={{ marginTop: '10px' }}>
                                    <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                                        🔍 Server Error Details
                                    </summary>
                                    <div style={{
                                        backgroundColor: '#f5f5f5',
                                        padding: '10px',
                                        borderRadius: '4px',
                                        marginTop: '5px'
                                    }}>
                                        <div><strong>Status:</strong> {serverErrorDetails.status}</div>
                                        <div><strong>Status Text:</strong> {serverErrorDetails.statusText}</div>
                                        <pre style={{
                                            backgroundColor: 'white',
                                            padding: '10px',
                                            borderRadius: '4px',
                                            overflow: 'auto',
                                            fontSize: '12px',
                                            marginTop: '5px'
                                        }}>
                                            {JSON.stringify(serverErrorDetails.data, null, 2)}
                                        </pre>
                                    </div>
                                </details>
                            )}
                            
                            <div style={{ marginTop: '15px' }}>
                                <button 
                                    onClick={fetchData}
                                    style={{
                                        padding: '8px 16px',
                                        backgroundColor: '#1976d2',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        marginRight: '10px'
                                    }}
                                >
                                    🔄 Retry API Call
                                </button>
                                
                                <button 
                                    onClick={() => {
                                        const url = window.location.origin + '/api/progress';
                                        window.open(url, '_blank');
                                    }}
                                    style={{
                                        padding: '8px 16px',
                                        backgroundColor: '#757575',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    🔗 Test API Directly
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Show data (with null safety) */}
                    <div style={{
                        backgroundColor: data?.hasError ? '#ffebee' : '#e8f5e8',
                        padding: '20px',
                        borderRadius: '8px',
                        border: `2px solid ${data?.hasError ? '#e57373' : '#81c784'}`
                    }}>
                        <div style={{fontSize: '28px', fontWeight: 'bold', color: '#2e7d32', margin: '0 0 10px 0'}}>
                            Total Seoul Survey Submissions: {data?.totalSubmit || 0}
                        </div>
                        
                        {data?.rawTotal !== undefined && (
                            <div style={{fontSize: '14px', color: '#666', margin: '5px 0'}}>
                                Raw total items: {data.rawTotal} | Filtered Seoul surveys: {data.totalSubmit}
                            </div>
                        )}
                        
                        <p style={{color: '#666', fontSize: '14px', margin: '10px 0 0 0'}}>
                            {data?.hasError 
                                ? '⚠️ Data may be incomplete due to API errors'
                                : 'All survey responses are from Seoul residents or people familiar with Seoul.'
                            }
                        </p>
                    </div>

                    {/* Debug Information */}
                    <div style={{
                        backgroundColor: '#f8f9fa',
                        padding: '15px',
                        borderRadius: '8px',
                        border: '1px solid #dee2e6',
                        marginTop: '20px'
                    }}>
                        <h3 style={{ margin: '0 0 10px 0' }}>🔧 Debugging Steps</h3>
                        <ol style={{ margin: 0, paddingLeft: '20px' }}>
                            <li>Check if your Vercel deployment includes the <code>/api/progress</code> endpoint</li>
                            <li>Verify your backend code doesn't have syntax errors</li>
                            <li>Check Vercel function logs for specific error messages</li>
                            <li>Test the API endpoint directly using the "Test API Directly" button above</li>
                            <li>Ensure all environment variables are configured in Vercel</li>
                        </ol>
                        
                        <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
                            <strong>Current API URL:</strong> {window.location.origin}/api/progress
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};