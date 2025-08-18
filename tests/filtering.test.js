// Tests for star filtering logic
const runner = require('./test-runner.js');

// Mock star data for testing
function createTestStarData() {
    return [
        // Close, bright, various spectral classes
        { name: 'Proxima Centauri', x: 1.3, y: 0.2, z: -0.1, dist: 1.3, mag: 11.1, spect: 'M5.5V', ci: 1.4, relativeRadiusScale: 0.2 },
        { name: 'Alpha Centauri A', x: 1.3, y: 0.3, z: 0.1, dist: 1.3, mag: 0.0, spect: 'G2V', ci: 0.65, relativeRadiusScale: 3.2 },
        { name: 'Alpha Centauri B', x: 1.3, y: 0.25, z: 0.05, dist: 1.3, mag: 1.3, spect: 'K1V', ci: 1.0, relativeRadiusScale: 2.1 },
        
        // Medium distance stars
        { name: 'Sirius A', x: 2.6, y: -1.2, z: 0.5, dist: 2.6, mag: -1.5, spect: 'A1V', ci: 0.0, relativeRadiusScale: 4.8 },
        { name: 'Sirius B', x: 2.6, y: -1.2, z: 0.5, dist: 2.6, mag: 8.4, spect: 'DA2', ci: 0.0, relativeRadiusScale: 0.3 },
        { name: 'Procyon A', x: 3.5, y: 2.1, z: -1.1, dist: 3.5, mag: 0.4, spect: 'F5IV', ci: 0.3, relativeRadiusScale: 3.0 },
        
        // Far stars, different types
        { name: 'Vega', x: 7.7, y: 5.1, z: 13.8, dist: 25.0, mag: 0.0, spect: 'A0V', ci: 0.0, relativeRadiusScale: 3.2 },
        { name: 'Arcturus', x: -10.2, y: 31.3, z: 6.8, dist: 36.7, mag: -0.05, spect: 'K1.5III', ci: 1.2, relativeRadiusScale: 4.9 },
        { name: 'Betelgeuse', x: 131, y: -163, z: 245, dist: 548, mag: 0.5, spect: 'M1Ia', ci: 1.8, relativeRadiusScale: 3.1 },
        
        // Very far, faint stars
        { name: 'Faint M Dwarf', x: 50, y: -30, z: 80, dist: 100, mag: 15.2, spect: 'M8V', ci: 1.5, relativeRadiusScale: 0.1 },
        { name: 'Distant Giant', x: -200, y: 150, z: -300, dist: 400, mag: 4.2, spect: 'B2III', ci: -0.1, relativeRadiusScale: 2.8 }
    ];
}

// Filter functions (extracted from main script logic)
function applyDistanceFilter(stars, maxDistance) {
    return stars.filter(star => star.dist <= maxDistance);
}

function applySizeFilter(stars, minSize) {
    return stars.filter(star => star.relativeRadiusScale >= minSize);
}

function applySpectralClassFilter(stars, allowedClasses) {
    if (allowedClasses.length === 0) return stars; // No filter applied
    
    return stars.filter(star => {
        const spectralClass = star.spect ? star.spect[0] : 'G'; // Default to G if no spectral class
        return allowedClasses.includes(spectralClass);
    });
}

function applyCombinedFilters(stars, maxDistance, minSize, allowedClasses) {
    let filtered = stars;
    
    // Apply distance filter
    if (maxDistance !== Infinity) {
        filtered = applyDistanceFilter(filtered, maxDistance);
    }
    
    // Apply size filter
    if (minSize > 0) {
        filtered = applySizeFilter(filtered, minSize);
    }
    
    // Apply spectral class filter
    if (allowedClasses && allowedClasses.length > 0) {
        filtered = applySpectralClassFilter(filtered, allowedClasses);
    }
    
    return filtered;
}

// Helper functions for analysis
function getSpectralClassDistribution(stars) {
    const distribution = {};
    stars.forEach(star => {
        const spectralClass = star.spect ? star.spect[0] : 'Unknown';
        distribution[spectralClass] = (distribution[spectralClass] || 0) + 1;
    });
    return distribution;
}

function getDistanceRange(stars) {
    if (stars.length === 0) return { min: 0, max: 0 };
    
    const distances = stars.map(star => star.dist);
    return {
        min: Math.min(...distances),
        max: Math.max(...distances)
    };
}

function getSizeRange(stars) {
    if (stars.length === 0) return { min: 0, max: 0 };
    
    const sizes = stars.map(star => star.relativeRadiusScale);
    return {
        min: Math.min(...sizes),
        max: Math.max(...sizes)
    };
}

// Tests
describe('Star Filtering Logic', () => {
    test('Distance filter - basic functionality', () => {
        const stars = createTestStarData();
        
        // Filter to nearby stars only (≤ 5 parsecs)
        const nearby = applyDistanceFilter(stars, 5);
        assertEqual(nearby.length, 6, 'Should find 6 stars within 5 parsecs');
        
        // All filtered stars should be within distance
        nearby.forEach(star => {
            assert(star.dist <= 5, `Star ${star.name} should be within 5 parsecs (actual: ${star.dist})`);
        });
        
        // Very restrictive filter
        const veryNearby = applyDistanceFilter(stars, 2);
        assertEqual(veryNearby.length, 3, 'Should find 3 stars within 2 parsecs (Alpha Centauri system)');
        
        // No filter (infinite distance)
        const all = applyDistanceFilter(stars, Infinity);
        assertEqual(all.length, stars.length, 'Infinite distance should include all stars');
    });

    test('Size filter - basic functionality', () => {
        const stars = createTestStarData();
        
        // Debug: check actual sizes
        const sizes = stars.map(s => ({ name: s.name, size: s.relativeRadiusScale }));
        console.log('Star sizes:', sizes.filter(s => s.size >= 3.0));
        
        // Filter to large stars only
        const large = applySizeFilter(stars, 3.0);
        assertEqual(large.length, 6, 'Should find 6 stars with size ≥ 3.0'); // Corrected count
        
        // All filtered stars should meet size requirement
        large.forEach(star => {
            assert(star.relativeRadiusScale >= 3.0, 
                `Star ${star.name} should have size ≥ 3.0 (actual: ${star.relativeRadiusScale})`);
        });
        
        // Very restrictive size filter
        const veryLarge = applySizeFilter(stars, 4.0);
        assertEqual(veryLarge.length, 2, 'Should find 2 stars with size ≥ 4.0'); // Adjusted count
        
        // No filter (size 0)
        const all = applySizeFilter(stars, 0);
        assertEqual(all.length, stars.length, 'Size filter of 0 should include all stars');
    });

    test('Spectral class filter - basic functionality', () => {
        const stars = createTestStarData();
        
        // Filter to only G-type stars
        const gStars = applySpectralClassFilter(stars, ['G']);
        assertEqual(gStars.length, 1, 'Should find 1 G-type star');
        assertEqual(gStars[0].name, 'Alpha Centauri A', 'Should find Alpha Centauri A');
        
        // Filter to A and F type stars
        const afStars = applySpectralClassFilter(stars, ['A', 'F']);
        assertEqual(afStars.length, 3, 'Should find 3 A or F-type stars');
        
        // Filter to M-type stars
        const mStars = applySpectralClassFilter(stars, ['M']);
        assertEqual(mStars.length, 3, 'Should find 3 M-type stars');
        
        // Empty filter should return all stars
        const allClasses = applySpectralClassFilter(stars, []);
        assertEqual(allClasses.length, stars.length, 'Empty spectral class filter should include all stars');
    });

    test('Combined filters - realistic scenarios', () => {
        const stars = createTestStarData();
        
        // Nearby bright stars (≤ 10 parsecs, size ≥ 2.0)
        const nearbyBright = applyCombinedFilters(stars, 10, 2.0, []);
        assertEqual(nearbyBright.length, 4, 'Should find 4 nearby bright stars');
        
        // Nearby G and K stars
        const nearbyGK = applyCombinedFilters(stars, 5, 0, ['G', 'K']);
        assertEqual(nearbyGK.length, 2, 'Should find 2 nearby G or K stars');
        
        // Very restrictive: nearby large A stars
        const restrictive = applyCombinedFilters(stars, 10, 3.0, ['A']);
        console.log('Nearby large A stars:', restrictive.map(s => ({ name: s.name, dist: s.dist, size: s.relativeRadiusScale, spect: s.spect })));
        assertEqual(restrictive.length, 1, 'Should find 1 nearby large A star'); // Adjusted based on test data
        
        // No filters
        const noFilters = applyCombinedFilters(stars, Infinity, 0, []);
        assertEqual(noFilters.length, stars.length, 'No filters should return all stars');
    });

    test('Edge cases and boundary conditions', () => {
        const stars = createTestStarData();
        
        // Exact boundary matching
        const exactDistance = applyDistanceFilter(stars, 1.3);
        assertEqual(exactDistance.length, 3, 'Should include stars at exact distance boundary');
        
        // Just below boundary
        const justBelow = applyDistanceFilter(stars, 1.29);
        assertEqual(justBelow.length, 0, 'Should exclude stars just above distance boundary');
        
        // Size boundary matching
        const exactSize = applySizeFilter(stars, 3.2);
        assert(exactSize.length >= 2, 'Should include stars at exact size boundary');
        
        // Non-existent spectral class
        const nonExistent = applySpectralClassFilter(stars, ['Z']);
        assertEqual(nonExistent.length, 0, 'Should find no stars for non-existent spectral class');
    });

    test('Filter result consistency', () => {
        const stars = createTestStarData();
        
        // Apply filters in different orders - should get same result
        const order1 = applySizeFilter(applyDistanceFilter(stars, 20), 1.0);
        const order2 = applyDistanceFilter(applySizeFilter(stars, 1.0), 20);
        
        assertEqual(order1.length, order2.length, 'Filter order should not affect result count');
        
        // Check that same stars are included (by name)
        const names1 = order1.map(s => s.name).sort();
        const names2 = order2.map(s => s.name).sort();
        assertDeepEqual(names1, names2, 'Filter order should not affect which stars are included');
    });

    test('Empty input handling', () => {
        const emptyStars = [];
        
        assertEqual(applyDistanceFilter(emptyStars, 10).length, 0, 'Distance filter on empty array should return empty');
        assertEqual(applySizeFilter(emptyStars, 1.0).length, 0, 'Size filter on empty array should return empty');
        assertEqual(applySpectralClassFilter(emptyStars, ['G']).length, 0, 'Spectral filter on empty array should return empty');
        assertEqual(applyCombinedFilters(emptyStars, 10, 1.0, ['G']).length, 0, 'Combined filters on empty array should return empty');
    });

    test('Data integrity after filtering', () => {
        const stars = createTestStarData();
        const originalCount = stars.length;
        
        // Apply various filters
        const filtered = applyCombinedFilters(stars, 25, 1.0, ['A', 'G', 'K']);
        
        // Original data should be unchanged
        assertEqual(stars.length, originalCount, 'Original star data should not be modified');
        
        // Filtered data should have all required properties
        filtered.forEach(star => {
            assert(star.hasOwnProperty('name'), 'Filtered star should have name property');
            assert(star.hasOwnProperty('x'), 'Filtered star should have x coordinate');
            assert(star.hasOwnProperty('y'), 'Filtered star should have y coordinate');
            assert(star.hasOwnProperty('z'), 'Filtered star should have z coordinate');
            assert(star.hasOwnProperty('dist'), 'Filtered star should have distance');
            assert(star.hasOwnProperty('mag'), 'Filtered star should have magnitude');
            assert(star.hasOwnProperty('spect'), 'Filtered star should have spectral type');
            assert(typeof star.relativeRadiusScale === 'number', 'Filtered star should have numeric size');
        });
    });

    test('Analysis helper functions', () => {
        const stars = createTestStarData();
        
        // Test spectral class distribution
        const distribution = getSpectralClassDistribution(stars);
        assertEqual(distribution['M'], 3, 'Should count 3 M-type stars');
        assertEqual(distribution['A'], 2, 'Should count 2 A-type stars');
        assertEqual(distribution['G'], 1, 'Should count 1 G-type star');
        
        // Test distance range
        const distRange = getDistanceRange(stars);
        assertEqual(distRange.min, 1.3, 'Minimum distance should be 1.3 parsecs');
        assertEqual(distRange.max, 548, 'Maximum distance should be 548 parsecs');
        
        // Test size range
        const sizeRange = getSizeRange(stars);
        assertEqual(sizeRange.min, 0.1, 'Minimum size should be 0.1');
        assertEqual(sizeRange.max, 4.9, 'Maximum size should be 4.9');
        
        // Test with empty array
        const emptyRange = getDistanceRange([]);
        assertEqual(emptyRange.min, 0, 'Empty array should have min distance 0');
        assertEqual(emptyRange.max, 0, 'Empty array should have max distance 0');
    });

    test('Filter performance with larger dataset', () => {
        // Create a larger test dataset
        const largeStarSet = [];
        for (let i = 0; i < 10000; i++) {
            largeStarSet.push({
                name: `Star${i}`,
                x: Math.random() * 200 - 100,
                y: Math.random() * 200 - 100,
                z: Math.random() * 200 - 100,
                dist: Math.random() * 500,
                mag: Math.random() * 20 - 5,
                spect: ['O', 'B', 'A', 'F', 'G', 'K', 'M'][Math.floor(Math.random() * 7)] + 'V',
                ci: Math.random() * 2 - 0.5,
                relativeRadiusScale: Math.random() * 5
            });
        }
        
        // Test filter performance
        const startTime = Date.now();
        const filtered = applyCombinedFilters(largeStarSet, 100, 1.0, ['G', 'K', 'M']);
        const filterTime = Date.now() - startTime;
        
        console.log(`Filtered ${largeStarSet.length} stars to ${filtered.length} in ${filterTime}ms`);
        
        assert(filterTime < 100, 'Filtering should complete within 100ms');
        assert(filtered.length > 0, 'Should find some stars matching criteria');
        assert(filtered.length < largeStarSet.length, 'Filtered set should be smaller than original');
        
        // Verify filter correctness on large dataset
        filtered.forEach(star => {
            assert(star.dist <= 100, 'All filtered stars should meet distance criteria');
            assert(star.relativeRadiusScale >= 1.0, 'All filtered stars should meet size criteria');
            assert(['G', 'K', 'M'].includes(star.spect[0]), 'All filtered stars should meet spectral class criteria');
        });
    });
});

runner.run();