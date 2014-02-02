var SW = {
    baseUrl : 'http://api.similarweb.com/site/',
    nonCompanyEmails : ['gmail.com', 'yahoo.com', 'hotmail.com', 'aol.com', 'googlemail.com'],
    notEnoughDataText : '--',
    subdomainText : 'Subdomain',
    unknownSiteText : 'n/a',

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
    }

};


function getSimilarSitesAndFrequentKeywords(site, userKey) {
    // check if we have a value in the site cell and a userkey
    if (!site) return;
    if (!userKey) return 'Enter a valid API key in the settings sheet';

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
    cache.put(site, JSON.stringify(data), 100); // cache expires after 100 seconds
    return data;
}

function checkApiKey(key) {
    if (!key) {
        return 'Enter an API key';
    } else {
        return 'Your key';
    }
}