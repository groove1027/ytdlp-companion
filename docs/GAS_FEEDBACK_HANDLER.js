/**
 * Google Apps Script — 피드백 수신 + 스크린샷 Google Drive 저장
 *
 * [설치 방법]
 * 1. Google Sheets에서 "확장 프로그램 > Apps Script" 열기
 * 2. 이 코드를 Code.gs에 붙여넣기
 * 3. FOLDER_ID를 본인의 Google Drive 폴더 ID로 변경
 *    (폴더 URL에서 https://drive.google.com/drive/folders/XXXXX 의 XXXXX 부분)
 * 4. "배포 > 새 배포 > 웹 앱" 선택
 *    - 실행 권한: 본인 계정
 *    - 액세스: "누구나" (Anyone)
 * 5. 배포 URL을 앱의 Feedback URL 설정에 입력
 *
 * [시트 컬럼 구조] (자동 생성)
 * A: 타임스탬프 | B: 유형 | C: 메시지 | D: 이메일 | E: 앱버전
 * F: 브라우저 | G: 프로젝트ID | H: 스크린샷 링크들
 */

// ────── 설정 ──────
const FOLDER_ID = 'YOUR_DRIVE_FOLDER_ID_HERE'; // Google Drive 폴더 ID
const SHEET_NAME = 'Feedback'; // 시트 탭 이름

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);

    // 시트가 없으면 생성 + 헤더 추가
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow([
        '타임스탬프', '유형', '메시지', '이메일', '앱 버전',
        '브라우저', '프로젝트 ID', '스크린샷'
      ]);
      // 헤더 스타일
      sheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }

    // 스크린샷 처리
    var screenshotLinks = [];
    if (data.screenshots && data.screenshots.length > 0) {
      var folder = DriveApp.getFolderById(FOLDER_ID);
      var timestamp = new Date().getTime();

      for (var i = 0; i < data.screenshots.length; i++) {
        var shot = data.screenshots[i];
        var base64Data = shot.base64.replace(/^data:image\/\w+;base64,/, '');
        var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), shot.mimeType, shot.name || ('screenshot_' + timestamp + '_' + i + '.png'));

        var file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        screenshotLinks.push(file.getUrl());
      }
    }

    // 시트에 행 추가
    var dt = new Date(data.timestamp || Date.now());
    var dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    var dateStr = dt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
      + ' (' + dayNames[dt.getDay()] + ')';

    sheet.appendRow([
      dateStr,
      data.type || '',
      data.message || '',
      data.email || '',
      data.appVersion || '',
      (data.userAgent || '').substring(0, 200),
      data.currentProjectId || '',
      screenshotLinks.length > 0 ? screenshotLinks.join('\n') : ''
    ]);

    // 스크린샷 셀에 하이퍼링크 적용
    if (screenshotLinks.length > 0) {
      var lastRow = sheet.getLastRow();
      var richText = SpreadsheetApp.newRichTextValue();
      var fullText = '';
      var linkRanges = [];

      for (var j = 0; j < screenshotLinks.length; j++) {
        var label = '사진 ' + (j + 1);
        var start = fullText.length;
        fullText += label;
        linkRanges.push({ start: start, end: start + label.length, url: screenshotLinks[j] });
        if (j < screenshotLinks.length - 1) fullText += '\n';
      }

      richText.setText(fullText);
      for (var k = 0; k < linkRanges.length; k++) {
        richText.setLinkUrl(linkRanges[k].start, linkRanges[k].end, linkRanges[k].url);
      }

      sheet.getRange(lastRow, 8).setRichTextValue(richText.build());
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    // 에러 로깅
    Logger.log('Feedback Error: ' + err.toString());
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// GET 요청 처리 (테스트용)
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    message: 'Feedback endpoint is active. Use POST to submit feedback.'
  })).setMimeType(ContentService.MimeType.JSON);
}
