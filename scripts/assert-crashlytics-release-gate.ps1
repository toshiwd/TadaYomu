$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$validationPath = Join-Path $repositoryRoot "validation\crashlytics-v1.3.65-validation.json"

if (-not (Test-Path -LiteralPath $validationPath -PathType Leaf)) {
    throw "Crashlytics validation artifact was not found."
}

$validation = Get-Content -Raw -LiteralPath $validationPath |
    ConvertFrom-Json

$requiredTrackedPaths = @(
    "android/build.gradle"
    "android/app/src/internal/AndroidManifest.xml"
    "android/app/src/internal/java/com/enish/tadayomu/CrashValidationReceiver.kt"
    "index.internal.ts"
    "src/services/internalCrashValidation.ts"
)
$untrackedRequiredPaths = @(
    $requiredTrackedPaths |
        Where-Object {
            @(& git -C $repositoryRoot ls-files -- $_).Count -eq 0
        }
)
$productionApkPath = Join-Path $repositoryRoot "TadaYomu-1.3.65.apk"
$productionApkHashMatches =
    (Test-Path -LiteralPath $productionApkPath -PathType Leaf) -and
    (Get-FileHash -Algorithm SHA256 -LiteralPath $productionApkPath).Hash -eq
    $validation.builds.productionCandidate.sha256
$worktreeClean =
    @(& git -C $repositoryRoot status --porcelain).Count -eq 0

$required = [ordered]@{
    "versionName = 1.3.65" =
        $validation.release.versionName -eq "1.3.65"
    "versionCode = 23" =
        $validation.release.versionCode -eq 23
    "upgrade data preserved" =
        $validation.deviceVerification.upgradeDataPreserved -eq $true
    "registered works preserved" =
        $validation.deviceVerification.registeredWorksPreserved -eq $true
    "reading position preserved" =
        $validation.deviceVerification.readingPositionPreserved -eq $true
    "downloads preserved" =
        $validation.deviceVerification.downloadsPreserved -eq $true
    "settings preserved" =
        $validation.deviceVerification.settingsPreserved -eq $true
    "sync state preserved" =
        $validation.deviceVerification.syncStatePreserved -eq $true
    "background work started" =
        $validation.deviceVerification.backgroundWorkStarted -eq $true
    "fatal report received" =
        -not [string]::IsNullOrWhiteSpace($validation.firebaseVerification.fatal.issueId) -and
        -not [string]::IsNullOrWhiteSpace($validation.firebaseVerification.fatal.reportReceivedTimestamp)
    "non-fatal report received" =
        -not [string]::IsNullOrWhiteSpace($validation.firebaseVerification.nonFatal.issueId) -and
        -not [string]::IsNullOrWhiteSpace($validation.firebaseVerification.nonFatal.reportReceivedTimestamp)
    "fatal sensitive data absent" =
        $validation.firebaseVerification.fatal.sensitiveDataFound -eq $false
    "fatal app version matches" =
        $validation.firebaseVerification.fatal.appVersionMatches -eq $true
    "fatal custom keys present" =
        $validation.firebaseVerification.fatal.customKeysPresent -eq $true
    "non-fatal sensitive data absent" =
        $validation.firebaseVerification.nonFatal.sensitiveDataFound -eq $false
    "non-fatal app version matches" =
        $validation.firebaseVerification.nonFatal.appVersionMatches -eq $true
    "non-fatal operation type present" =
        $validation.firebaseVerification.nonFatal.operationTypePresent -eq $true
    "non-fatal internal work ID present" =
        $validation.firebaseVerification.nonFatal.internalWorkIdPresent -eq $true
    "fatal stack trace usable" =
        $validation.firebaseVerification.fatal.stackTraceUsable -eq $true
    "non-fatal stack trace usable" =
        $validation.firebaseVerification.nonFatal.stackTraceUsable -eq $true
    "fatal and non-fatal issues separated" =
        $validation.firebaseVerification.nonFatal.separateFromFatalIssue -eq $true -and
        $validation.firebaseVerification.fatal.issueId -ne
        $validation.firebaseVerification.nonFatal.issueId
    "debug collection disabled" =
        $validation.deviceVerification.debugCollectionDisabledRuntime -eq $true
    "release collection enabled" =
        $validation.deviceVerification.releaseCollectionEnabledRuntime -eq $true
    "production crash-test entry absent" =
        $validation.builds.productionCandidate.crashValidationEntryPresent -eq $false
    "Crashlytics SDK present" =
        $validation.builds.productionCandidate.crashlyticsSdkPresent -eq $true
    "privacy documentation matches implementation" =
        $validation.staticVerification.privacyDocumentationMatchesImplementation -eq $true
    "internal validation source absent from production" =
        $validation.staticVerification.internalValidationSourceAbsentFromProductionSourceMap -eq $true -and
        $validation.staticVerification.productionCrashValidationSymbolsAbsent -eq $true
    "tests passed" =
        $validation.staticVerification.npmTestPassed -eq $true -and
        $validation.staticVerification.typescriptPassed -eq $true -and
        $validation.staticVerification.lintPassed -eq $true
    "signed APK verified" =
        $validation.builds.productionCandidate.signed -eq $true
    "production APK hash matches validation" =
        $productionApkHashMatches
    "required release sources tracked" =
        $untrackedRequiredPaths.Count -eq 0
    "release commit worktree clean" =
        $worktreeClean
    "completion judgment" =
        $validation.completionJudgment -eq
        "tadayomu_crashlytics_release_v1_3_65_complete"
}

$failed = @(
    $required.GetEnumerator() |
        Where-Object { -not $_.Value } |
        ForEach-Object { $_.Key }
)

if ($failed.Count -gt 0) {
    Write-Error (
        "Crashlytics release gate failed: " +
        ($failed -join "; ")
    )
    exit 1
}

Write-Output "Crashlytics release gate passed."
