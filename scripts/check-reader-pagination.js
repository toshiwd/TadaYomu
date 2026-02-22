#!/usr/bin/env node
/**
 * check-reader-pagination.js
 *
 * Pure-arithmetic regression tests for the Reader pagination logic.
 * Mirrors the calcPages() / goToPage() formulas from ReaderScreen.tsx.
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

// ============================================================
// Summary
// ============================================================
console.log(`\n========================================`);
console.log(`Results: ${passed} PASS, ${failed} FAIL`);
console.log(`========================================\n`);

process.exit(failed > 0 ? 1 : 0);
