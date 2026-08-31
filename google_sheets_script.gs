/**
 * Pebble Gym Tracker - Google Sheets Integration
 * * This script catches the webhook from your Pebble smartwatch,
 * verifies your secret password, and organizes your workout data
 * into clean, individual rows for each set.
 */

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var parsedData = JSON.parse(e.postData.contents);
  
  // --- THE BOUNCER ---
  // If the incoming envelope doesn't have the exact matching token, throw it away!
  // NOTE: Change this to your own secure password before deploying!
  var secretPassword = "YOUR_SECRET_PASSWORD_HERE"; 
  
  if (parsedData.token !== secretPassword) {
    return ContentService.createTextOutput("Access Denied: Invalid Token");
  }
  // -------------------

  var rawString = parsedData.workoutData;
  var parts = rawString.split('|');
  
  // Extract the header info
  var routine = parts[0];
  var date = parts[1];
  var duration = parts[2];
  
  // New-format workouts carry a reserved "@HR" time-series section and encode
  // each set as 4 tokens (reps, weight, set peak HR, set avg HR). Older
  // workouts used workout-wide maxHr/avgHr + 2-token sets.
  var isNewFormat = parts.indexOf('@HR') !== -1;

  var currentExercise = "";
  var setNum = 1;
  var sensationTitles = ["Unstoppable", "Strong", "Normal", "Exhausted", "Struggled"];
  var sensation = sensationTitles[5-parts[3]];
  var accuracy = parts[4];
  var density = parts[5];

  var startIndex = isNewFormat ? 6 : 8;
  
  // Loop through the rest of the string to parse exercises and sets
  // i was orignally set to 3, which messed up the first record of a session with 
  // the extra values for sensation, accuracy, density, max hr, and avg hr 
  for (var i = startIndex; i < parts.length; i++) {
    // Reserved HR time-series marker: the next token is "sec,bpm;sec,bpm;..."
    if (parts[i] === '@HR') {
      var series = parts[i + 1] || "";
      if (series) {
        // uncomment below to append the HR time-series to the sheet
        // sheet.appendRow(["HR Time Series"]);
        // sheet.appendRow(["Time (s)", "Heart Rate (BPM)"]);
        // var samples = series.split(";");
        // for (var s = 0; s < samples.length; s++) {
        //   var pair = samples[s].split(",");
        //   if (pair.length === 2 && pair[0] !== "") sheet.appendRow([pair[0], pair[1]]);
        // }
      }
      break;
    }

    if (parts[i] === "") { continue; }   // safety: skip stray empty tokens

    // If the part is not a number, it is the exercise name
    if (isNaN(parts[i])) {
      currentExercise = parts[i];
      setNum = 1; // Reset the set counter for the new exercise
    } else {
      // If it is a number, it is the reps, the next is weight, then set peak/avg HR
      var reps = parts[i];
      var weight = parts[i + 1];
      var setPeak = isNewFormat ? parts[i + 2] : "";
      var setAvg  = isNewFormat ? parts[i + 3] : "";
      var currentRow = [date, routine, duration, currentExercise, setNum, reps, weight];

      // uncomment below to add sensation to output
      // currentRow = currentRow.concat([sensation]);
      
      // uncomment below to add accuracy to output
      // currentRow = currentRow.concat([accuracy]);
      
      // uncomment below to add density to output
      // currentRow = currentRow.concat([density]);
      
      // uncomment below to add per-set peak HR to output
      // currentRow = currentRow.concat([setPeak]);
      
      // uncomment below to add per-set average HR to output
      // currentRow = currentRow.concat([setAvg]);
      
      // Append the perfectly formatted row to the spreadsheet!
      sheet.appendRow(currentRow);
      
      setNum++;
      i += isNewFormat ? 3 : 1; // Skip the set's remaining tokens
    }
  }
  return ContentService.createTextOutput("Success");
}
