var SW = {
    baseUrl : 'http://api.similarweb.com/site/',
    cacheDelay : 500,
    nonCompanyEmails : ['gmail.com', 'yahoo.com', 'hotmail.com', 'aol.com', 'googlemail.com'],
    notEnoughDataText : '--',
    subdomainText : 'Subdomain',
    unknownSiteText : 'n/a',
    text : {
        noApiKey : 'Enter a valid API key in the settings sheet'
    },

    fetchOptions : {
        "muteHttpExceptions" : true // needed so we can get status code of response
    },

    fetchData : function(site, apiVersion, userKey){
        // apiVersion ex. 'v2/CategoryRank'
        var url = this.baseUrl + site + '/' + apiVersion + '?Format=JSON&UserKey=' + userKey;
        var resp = UrlFetchApp.fetch(url, SW.fetchOptions);
        var respCode = resp.getResponseCode();

        if (respCode === 404){
            return 'Not enough data';
        } else if (respCode !== 200){
            return 'Key is not valid';
        } else {
            return JSON.parse(resp);
        }
    },

    getCache : function(){
        return CacheService.getPrivateCache();
    },

    sortByFrequencyAndRemoveDuplicates : function(arr){
        var freq = {}, val;

        // compute frequencies of each value
        for(var i = 0; i < arr.length; i++) {
            val = arr[i];
            if(val in freq) {
                freq[val]++;
            }
            else {
                freq[val] = 1;
            }
        }

        // make array from the frequency object to de-duplicate
        var uniques = [];
        for(val in freq) {
            uniques.push(val);
        }

        // sort the uniques array in descending order by frequency
        function compareFrequency(a, b) {
            return freq[b] - freq[a];
        }

        return uniques.sort(compareFrequency);
    },

    parseSiteFromEmail : function(email){
        var site = email.split('@')[1];

        // check if it is a non-regular url
        var urlSections = site.split('.');
        if ( urlSections.length > 2 && urlSections[1] !== 'com' && urlSections[1] !== 'co' ){
            return this.subdomainText;
        }

        // check if it's a non company email (like gmail)
        if (this.nonCompanyEmails.indexOf(site) > -1){
            return this.unknownSiteText;
        } else {
            return site;
        }
    },

    checkAdultContent : function(categoryResp){
        // check if we got a valid resp or if it returned an error
        if (typeof categoryResp !== 'object') return categoryResp;
        if (categoryResp.Category == 'Adult') {
            return 'yes';
        } else {
            return 'no';
        }
    }
};

function getCompanyCategoryRankTraffic(email, userKey){
    if (!email) return;
    if (!userKey) return SW.text.noApiKey;

    var site = SW.parseSiteFromEmail(email);

    // if no site, stop and don't make api calls
    if (!site) return;

    // if we have email, but company is unknown or it is a subdomain
    if (site == SW.unknownSiteText) return [SW.unknownSiteText, SW.notEnoughDataText, SW.notEnoughDataText, SW.notEnoughDataText];
    if (site == SW.subdomainText) return [SW.subdomainText, SW.notEnoughDataText, SW.notEnoughDataText, SW.notEnoughDataText];

    // if we already have this site's data in the cache, don't do another api request
    var cache = SW.getCache(),
        cacheVal = JSON.parse( cache.get(site) ); // returns string, need to convert to array
    if (cacheVal != null) return cacheVal;

    // if there is a site and we know it try making first api call
    var categoryData = SW.fetchData(site, '/v2/CategoryRank', userKey);
    if (!categoryData) return [site, SW.notEnoughDataText, SW.notEnoughDataText, SW.notEnoughDataText];
    var category = categoryData.Category.replace(/_/g, " ");

    // if category returned data, go ahead and make other api calls
    Utilities.sleep(1000);
    var globalRankData = SW.fetchData(site, '/v1/traffic', userKey),
        globalRank = globalRankData.GlobalRank;
    if (globalRank === 0) globalRank = 'Redirects to another site';

    Utilities.sleep(2000);
    var estimatedTrafficData = SW.fetchData(site, '/v1/EstimatedTraffic', userKey),
        estimatedTraffic = estimatedTrafficData.EstimatedVisitors;
    if (estimatedTraffic === 0) estimatedTraffic = 'Redirects to another site';

    var data = [site, category, globalRank, estimatedTraffic];

    // store our cached result (as JSON) and return data array
    cache.put(site, JSON.stringify(data), SW.cacheDelay); // cache expires after 1000 seconds
    return data;
}

function getSimilarSitesAndFrequentKeywords(site, userKey) {
    // check if we have a value in the site cell and a userkey
    if (!site) return;
    if (!userKey) return SW.text.noApiKey;

    // if we already have this site's data in the cache, don't do another api request
    var cache = SW.getCache(),
        cacheVal = JSON.parse( cache.get(site) ); // returns string, need to convert to array
    if (cacheVal != null) return cacheVal;

    // fetch APIs needed
    var similarSitesData = SW.fetchData(site, 'v2/similarsites', userKey);
    var similarSites = similarSitesData.SimilarSites;

    // if we don't have any similar sites
    if (similarSites.length === 0) return 'not enough data';

    // loop through the returned similarsites arr and look up the keywords for each url
    var ss = [], organicWords = [], paidWords = [];
    for (var i = 0; i < similarSites.length; i++){
        var url = similarSites[i].Url;
        ss.push(url);
        var keywordsData = SW.fetchData(url, 'v1/searchintelligence', userKey);
        organicWords = organicWords.concat(keywordsData.TopOrganicTerms);
        paidWords = paidWords.concat(keywordsData.TopPaidTerms);
    }

    // combine organic and paid words arrays, sort by frequency, remove duplicates and return top 10
    var allWords = organicWords.concat(paidWords);
    var words = SW.sortByFrequencyAndRemoveDuplicates( allWords );

    var topTenSites = ss.slice(0,10);
    var topTenWords = words.slice(0,10);
    var data = [topTenSites, topTenWords];

    // store our cached result (as JSON) and return data
    cache.put(site, JSON.stringify(data), SW.cacheDelay); // cache expires after 100 seconds
    return data;
}

function estimateTraffic(site, userKey) {
    // check if we have a value in the site cell and a userkey
    if (!site) return;
    if (!userKey) return SW.text.noApiKey;

    // if we already have this site's data in the cache, don't do another api request
    var cache = SW.getCache(),
        cacheVal = JSON.parse( cache.get(site) ); // returns string, need to convert to array
    if (cacheVal != null) return cacheVal;

    // fetch APIs needed and put returned data in an array
    var estTraffic = SW.fetchData(site, '/v1/EstimatedTraffic', userKey);

    // store our cached result (as JSON) and return data
    cache.put(site, JSON.stringify(estTraffic.EstimatedVisitors), SW.cacheDelay); // cache expires after 1 seconds
    return estTraffic.EstimatedVisitors;
}

function detectAdultContent(site, userKey){
    // check if we have a value in the site cell and a userkey
    if (!site) return;
    if (!userKey) return SW.text.noApiKey;

    // if we already have this site's data in the cache, don't do another api request
    var cache = SW.getCache(),
        cacheVal = JSON.parse( cache.get(site) ); // returns string, need to convert to array
    if (cacheVal != null) return cacheVal;

    // fetch APIs needed and put returned data in an array
    var categoryRank = SW.fetchData(site, 'v2/CategoryRank', userKey);

    var data =  SW.checkAdultContent(categoryRank);

    // store our cached result (as JSON) and return data array
    cache.put(site, JSON.stringify(data), SW.cacheDelay); // cache expires after 1000 seconds
    return data;
}

function checkApiKey(key) {
    if (!key) {
        return 'Enter an API key';
    } else {
        return 'Your key';
    }
}