import './App.css';
import {React, useState} from "react";
import {BrowserRouter, Route, Routes} from 'react-router-dom'
import {HomePage} from "./HomePage";
import {SurveyCitySelectPage} from "./SurveyCitySelectPage";
import {SurveyImgChoicePage} from "./SurveyImgChoicePage";
import {SurveyPersonalInfoPage} from "./SurveyPersonalInfoPage";
import {ThankYouPage} from "./ThankYouPage";
import {ProgressPage} from "./ProgressPage";
import {useStateMachine} from "little-state-machine";


function App() {

    const {actions, state} = useStateMachine({});
    //const [globalLanguage, setGlobalLanguage] = useState(state['language'] || 'en');
    const [globalLanguage, setGlobalLanguage] = useState(state['language'] || 'Korean');
    const textDirection = (globalLanguage === 'arb') ? "rtl" : "ltr";
    return (
        <div className="App Theme-Background" dir={textDirection}>
            <div className="App-container">
                <BrowserRouter>
                    <Routes>
                        <Route path="*" element={<HomePage setGlobalLanguage={setGlobalLanguage}/>}/>
                        <Route path="/progress" element={<ProgressPage/>}/>
                        <Route path="/surveycity" element={<SurveyCitySelectPage/>}/>
                        <Route path="/survey" element={<SurveyImgChoicePage/>}/>
                        <Route path="/survey/:surveyid" element={<SurveyImgChoicePage/>}/>
                        <Route path="/surveyinfo" element={<SurveyPersonalInfoPage/>}/>
                        <Route path="/surveyinfo/:surveyid" element={<SurveyPersonalInfoPage/>}/>
                        <Route path="/thankyou/:surveyid" element={<ThankYouPage/>}/>
                    </Routes>
                </BrowserRouter>
            </div>
        </div>
    );
}

export default App;
