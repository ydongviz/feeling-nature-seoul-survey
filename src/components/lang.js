import {React} from "react";

export const languages = {
     "한국어": 'Korean', "English": 'eng',
};

export const LOCALE_TEXT = {

    // City List
    "city-list-Seoul": {
        "eng": "Seoul",
        "Korean": "서울"
    },
    
    // Home Page
    'home-page-title': {
        'eng': 'Feeling Nature Seoul',
        'Korean': '필링 네이처 서울',
    }, 'home-page-subtitle': {
        'eng': 'Measuring How People Perceive Nature in Seoul',
        'Korean': '서울에서 사람들이 자연을 어떻게 인식하는지 측정하기',
    }, 'home-page-description': {
        'eng': (<>
            You're invited to participate in a brief research survey on how people perceive and value nature in Seoul. It takes <span style={{color: '#598112', fontWeight: '600'}}>3–5 minutes</span> to complete. 
            Participation is voluntary, responses are anonymous, and all data will be used solely for scientific research.
        </>), 'Korean': (<>
            서울에서 사람들이 자연을 어떻게 인식하고 소중하게 여기는지 알아보기 위한 간단한 설문 조사에 참여해 주세요. 설문은 약 <span style={{color: '#598112', fontWeight: '600'}}>3–5분</span> 정도 소요됩니다. 
            참여는 자발적이고 응답은 익명으로 처리되며, 모든 결과는 오직 학술 연구 목적으로만 사용됩니다. 
        </>), 
    }, 'home-page-button-start-survey': {
        'eng': 'Start',
        'Korean': '시작하기',
    }, 'home-page-author-title': {
        'eng': 'A project by',
        'Korean': '프로젝트 진행',
    },

    // Seoul Residency Question
    'seoul-residency-question': {
        'eng': '1 | Have you lived or spent significant time in Seoul for at least 1 year?',
        'Korean': '1 | 서울에 1년 이상 거주하거나 머문 적이 있습니까?',
    },
    'seoul-residency-description': {
        'eng': 'This survey is for people who currently or previously lived in Seoul, or who have visited frequently and know the city well, having experienced Seoul for at least 1 year.',
        'Korean': '이 설문은 약 1년 이상 서울에 거주했거나 자주 방문하여 서울에 익숙한 분들을 대상으로 합니다.',
    },
    'seoul-residency-yes': {
        'eng': 'Yes',
        'Korean': '네',
    },
    'seoul-residency-no': {
        'eng': 'No',
        'Korean': '아니오',
    },

    // Thank you page for non-eligible users
    'thank-you-not-eligible-title': {
        'eng': 'Thank you for your interest!',
        'Korean': '관심을 가져주셔서 감사합니다!',
    },
    'thank-you-not-eligible-description': {
        'eng': 'This survey is intended for people who have lived or spent significant time in Seoul for at least 1 year. If this doesn’t apply to you, you may close the page or use the button below to restart. Thank you for your understanding.',
        'Korean': '이 설문은 서울에 1년 이상 거주했거나 자주 방문하며 서울에 익숙하신 분들을 대상으로 제작되었습니다. 이에 해당하지 않을 경우, 페이지를 닫거나 아래 버튼을 눌러 다시 시작해 주세요. 양해해 주셔서 감사합니다.',
    },

    // SurveyImgChoicePage
    'survey-img-choice-title': {
        'eng': 'Which image brings you more positive feelings?',
        'Korean': '어느 이미지가 더 긍정적인 느낌을 가져다주나요?',
    }, 'survey-img-choice-comment-box-question': {
        'eng': 'Which elements and aspects of the selected image bring you more positive feelings?',
        'Korean': '선택한 이미지의 어떤 요소나 측면이 긍정적인 느낌을 주었나요?',
    }, 'survey-img-choice-submit-button': {
        'eng': 'Next', 'Korean': '다음', 
    },
    'survey-img-choice-comment-placeholder': {
        'eng': 'Please comment on your choice',
        'Korean': '선택한 이유를 간단히 설명해주세요',
    },

    'survey-img-choice-button-left': {
        'eng': 'Left', 'Korean': '왼쪽', 
    },
    'survey-img-choice-button-right': {
        'eng': 'Right', 'Korean': '오른쪽', 
    },
    'survey-img-choice-button-top': {
        'eng': 'Top', 'Korean': '위쪽', 
    },
    'survey-img-choice-button-bottom': {
        'eng': 'Bottom', 'Korean': '아래쪽', 
    },
    
    'survey-img-choice-loading-text': {
        'eng': 'Loading', 'Korean': '로딩 중',  
    },


    // SurveyPersonalInfoPage
    'survey-personal-info-question-age': {
        'eng': '8 | Please select your age group.',
        'Korean': '8 | 연령대를 선택해 주세요.',
    }, 'survey-personal-info-question-gender': {
        'eng': '9 | Please select the option that describes you best.',
        'Korean': '9 | 본인에게 가장 적합한 항목을 선택해 주세요.',
    },

    'survey-personal-info-question-gender-option-Male': {
        'eng': 'Male', 'Korean': '남성', 
    }, 'survey-personal-info-question-gender-option-Female': {
        'eng': 'Female', 'Korean': '여성',
    }, 'survey-personal-info-question-gender-option-Other': {
        'eng': 'Other', 'Korean': '기타', 
    }, 'survey-personal-info-question-gender-option-Prefer not to answer': {
        'eng': 'Prefer not to answer',
        'Korean': '응답하지 않음',
    },
    'survey-personal-info-submit-button': {
        'eng': 'Submit', 'Korean': '제출하기',
    },

    // Thank you
    'thank-you-title': {
        'eng': 'Your Biophilic Individual Perceptions (BiP) result has been loaded on the TV. Thank you for your participation!',
        'Korean': '당신의 생물친화적 개인 인식(BiP) 결과가 TV에 표시되었습니다. 참여해 주셔서 감사합니다!',        
    }, 'thank-you-description': {
        'eng': 'Return to the homepage to take the survey again if you would like to contribute more to this research.',
        'Korean': '이 연구에 더 기여하고 싶으시면, 처음으로 돌아가서 설문을 다시 진행해 주세요.',
    }, 'thank-you-button-start-again': {
        'eng': 'Start Again',
        'Korean': '다시 시작하기',
    }, 'thank-you-form-description': {
        'eng': 'Would you like to know more about this research? Get in touch with us!',
        'Korean': '이 연구에 대해 더 알고 싶으신가요? 저희에게 연락해 주세요!',
    }, 'thank-you-form-full-name': {
        'eng': 'Full Name',
        'Korean': '이름',
    }, 'thank-you-form-email': {
        'eng': 'Email',
        'Korean': '이메일',
    }, 'thank-you-form-message': {
        'eng': 'Message', 'Korean': '메시지',
    }, 'thank-you-form-submit-button': {
        'eng': 'Send', 'Korean': '보내기', 
    }

}

export const DEFAULT_LANG = 'Korean';

export const locale_text_raw =
    (lang, identifier) => (LOCALE_TEXT[identifier][lang] || LOCALE_TEXT[identifier][DEFAULT_LANG]);
export const locale_text = (lang, identifier) => {
    const text = locale_text_raw(lang, identifier);
    if (lang === 'arb') {
        return (
            <p style={{margin: 0}}>
                {text}
            </p>
        )
    }


    return text;
};
