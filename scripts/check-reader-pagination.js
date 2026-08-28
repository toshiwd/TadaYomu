#!/usr/bin/env node
/**
 * check-reader-pagination.js
 *
 * Pure-arithmetic regression tests for the Reader pagination logic.
 * Mirrors the calcPages() / goToPage() formulas from readerHtmlGenerator.ts.
 *
 * Usage:  node scripts/check-reader-pagination.js
 * Exit 0 = all PASS, Exit 1 = at least one FAIL.
 */

'use strict';

let passed = 0;
let failed = 0;

function calcPages(scrollWidth, pageStepPx) {
    if (pageStepPx <= 0) return { totalPages: 1, maxOffset: 0 };
    const maxOffset = Math.max(0, scrollWidth - pageStepPx);
    let totalPages = Math.ceil(maxOffset / pageStepPx) + 1;
    if (totalPages < 1) totalPages = 1;
    return { totalPages, maxOffset };
}

function goToPage(page, totalPages, pageStepPx, scrollWidth) {
    page = Math.max(0, Math.min(page, totalPages - 1));
    const maxOffset = Math.max(0, scrollWidth - pageStepPx);
    const offset = Math.min(page * pageStepPx, maxOffset);
    return { page, offset, maxOffset };
}

function restorePage(progress, totalPages) {
    const normalized = normalizeProgress(progress);
    return Math.round(normalized * Math.max(0, totalPages - 1));
}

function normalizeProgress(progress) {
    const normalized = Number(progress);
    if (!Number.isFinite(normalized)) return 0;
    return Math.max(0, Math.min(normalized, 1));
}

function restoreState(progress, totalPages) {
    const normalized = normalizeProgress(progress);
    return {
        page: restorePage(normalized, totalPages),
        progress: normalized,
    };
}

function shouldAcceptPageDuringRestore(progress, totalPages, currentPage, currentProgress) {
    const normalized = normalizeProgress(progress);
    return restorePage(normalized, totalPages) + 1 === currentPage
        && Math.abs(normalizeProgress(currentProgress) - normalized) < 0.000001;
}

function pageProgress(page, totalPages) {
    return totalPages > 1 ? page / (totalPages - 1) : 0;
}

function reflowPage(page, oldTotalPages, newTotalPages) {
    return restorePage(pageProgress(page, oldTotalPages), newTotalPages);
}

function pageForContentOffset(contentOffset, pageBoundaries) {
    let page = 0;
    for (let i = 1; i < pageBoundaries.length; i++) {
        if (pageBoundaries[i] <= contentOffset + 1) page = i;
        else break;
    }
    return page;
}

function assert(label, actual, expected) {
    if (actual === expected) {
        console.log(`  PASS: ${label} — got ${actual}`);
        passed++;
    } else {
        console.log(`  FAIL: ${label} — expected ${expected}, got ${actual}`);
        failed++;
    }
}

// ============================================================
// Test Suite
// ============================================================

console.log('\n=== Test 1: Exact multiple (1000 / 500) ===');
{
    const { totalPages, maxOffset } = calcPages(1000, 500);
    assert('totalPages', totalPages, 2);
    assert('maxOffset', maxOffset, 500);
}

console.log('\n=== Test 2: Remainder (1100 / 500) ===');
{
    const { totalPages, maxOffset } = calcPages(1100, 500);
    assert('totalPages', totalPages, 3);
    assert('maxOffset', maxOffset, 600);
}

console.log('\n=== Test 3: Single page (500 / 500) ===');
{
    const { totalPages, maxOffset } = calcPages(500, 500);
    assert('totalPages', totalPages, 1);
    assert('maxOffset', maxOffset, 0);
}

console.log('\n=== Test 4: Content smaller than page (300 / 500) ===');
{
    const { totalPages, maxOffset } = calcPages(300, 500);
    assert('totalPages', totalPages, 1);
    assert('maxOffset', maxOffset, 0);
}

console.log('\n=== Test 5: Padding scenario (1080 / 360) ===');
{
    const { totalPages, maxOffset } = calcPages(1080, 360);
    assert('totalPages', totalPages, 3);
    assert('maxOffset', maxOffset, 720);
}

console.log('\n=== Test 6: Last page reachable (remainder case) ===');
{
    const sw = 1100;
    const step = 500;
    const { totalPages } = calcPages(sw, step);
    const { offset, maxOffset } = goToPage(totalPages - 1, totalPages, step, sw);
    assert('last page offset <= maxOffset', offset <= maxOffset, true);
    assert('last page offset', offset, 600);
}

console.log('\n=== Test 7: Drift check with padding (1080 / 360) ===');
{
    const sw = 1080;
    const step = 360;
    const { totalPages, maxOffset } = calcPages(sw, step);
    // Visit every page and check no drift (offset never exceeds maxOffset)
    let driftErrors = 0;
    for (let p = 0; p < totalPages; p++) {
        const { offset } = goToPage(p, totalPages, step, sw);
        if (offset > maxOffset) driftErrors++;
    }
    assert('zero drift errors', driftErrors, 0);
    // Last page should land exactly on maxOffset
    const last = goToPage(totalPages - 1, totalPages, step, sw);
    assert('last page offset equals maxOffset', last.offset, maxOffset);
}

console.log('\n=== Test 8: Drift check with non-multiple padding (1000 / 360) ===');
{
    const sw = 1000;
    const step = 360;
    const { totalPages, maxOffset } = calcPages(sw, step);
    assert('totalPages', totalPages, 3);
    assert('maxOffset', maxOffset, 640);
    let driftErrors = 0;
    for (let p = 0; p < totalPages; p++) {
        const { offset } = goToPage(p, totalPages, step, sw);
        if (offset > maxOffset) driftErrors++;
    }
    assert('zero drift errors', driftErrors, 0);
    const last = goToPage(totalPages - 1, totalPages, step, sw);
    assert('last page offset <= maxOffset', last.offset <= maxOffset, true);
}

console.log('\n=== Test 9: Very large content (50000 / 412) ===');
{
    const sw = 50000;
    const step = 412;
    const { totalPages, maxOffset } = calcPages(sw, step);
    const expectedMax = 50000 - 412;
    assert('maxOffset', maxOffset, expectedMax);
    const expectedPages = Math.ceil(expectedMax / step) + 1;
    assert('totalPages', totalPages, expectedPages);
    const last = goToPage(totalPages - 1, totalPages, step, sw);
    assert('last offset <= maxOffset', last.offset <= maxOffset, true);
}

console.log('\n=== Test 10: pageStepPx = 0 edge case ===');
{
    const { totalPages } = calcPages(1000, 0);
    assert('totalPages when pageStep=0', totalPages, 1);
}

console.log('\n=== Test 11: Reading position round trip (5 / 25) ===');
{
    const totalPages = 25;
    const savedProgress = (5 - 1) / (totalPages - 1);
    assert('restored page (zero-based)', restorePage(savedProgress, totalPages), 4);
}

console.log('\n=== Test 12: Ignore page 1 until saved page 5 is restored ===');
{
    const savedProgress = (5 - 1) / (25 - 1);
    assert(
        'reject provisional first page',
        shouldAcceptPageDuringRestore(savedProgress, 25, 1, savedProgress),
        false,
    );
    assert(
        'accept restored fifth page',
        shouldAcceptPageDuringRestore(savedProgress, 25, 5, savedProgress),
        true,
    );
    assert(
        'reject stale progress even on the same page',
        shouldAcceptPageDuringRestore(savedProgress, 25, 5, savedProgress + 0.01),
        false,
    );
}

console.log('\n=== Test 13: Clamp invalid saved progress ===');
{
    assert('negative progress', normalizeProgress(-0.5), 0);
    assert('progress over one', normalizeProgress(1.5), 1);
    assert('NaN progress', normalizeProgress(Number.NaN), 0);
}

console.log('\n=== Test 14: Preserve progress across provisional layout ===');
{
    const provisional = restoreState(0.727, 1);
    assert('provisional page', provisional.page, 0);
    assert('provisional progress remains saved value', provisional.progress, 0.727);

    const finalLayout = restoreState(provisional.progress, 100);
    assert('restored page after repagination', finalLayout.page, 72);
    assert('progress survives repagination', finalLayout.progress, 0.727);
}

console.log('\n=== Test 13: Preserve relative position when pagination changes ===');
{
    assert('50/101 pages becomes 100/201 pages', reflowPage(50, 101, 201), 100);
    assert('last page remains last page', reflowPage(100, 101, 151), 150);
}

console.log('\n=== Test 14: Long chapter progress keeps sub-percent precision ===');
{
    const totalPages = 401;
    const page = 137;
    const exactProgress = pageProgress(page, totalPages);
    const roundedProgress = Math.round(exactProgress * 100) / 100;
    assert('exact progress restores original page', restorePage(exactProgress, totalPages), page);
    assert('two-decimal progress would drift', restorePage(roundedProgress, totalPages) === page, false);
}

console.log('\n=== Test 15: Content anchor survives a screen-size page-count change ===');
{
    const logicalTextOffset = 2400;
    const tabletBoundaries = [0, 500, 1000, 1500, 2000, 2500];
    const phoneBoundaries = [0, 280, 560, 840, 1120, 1400, 1680, 1960, 2240, 2520, 2800];
    const tabletPage = pageForContentOffset(logicalTextOffset, tabletBoundaries);
    const phonePage = pageForContentOffset(logicalTextOffset, phoneBoundaries);
    assert('tablet page differs from phone page', tabletPage === phonePage, false);
    assert('tablet page contains same text offset', tabletBoundaries[tabletPage] <= logicalTextOffset, true);
    assert('phone page contains same text offset', phoneBoundaries[phonePage] <= logicalTextOffset, true);
}

// ============================================================
// Summary
// ============================================================
console.log(`\n========================================`);
console.log(`Results: ${passed} PASS, ${failed} FAIL`);
console.log(`========================================\n`);

process.exit(failed > 0 ? 1 : 0);
