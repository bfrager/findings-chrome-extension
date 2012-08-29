function showKindleNotification(body){
    return showNotification('Findings Kindle Sync', body);
}

var KindleSync = (function() {
    var sync_start_time = null;
    var upcoming_asins = [];
    var used_asins = [];
    var offset = null;
    var books_with_highlights = 0;
    var highlight_total = 0;
    var post_url = config.findingsBaseURL + "/clips/enterbatch/";
    var notification_email_url = config.findingsBaseURL + "/email/notify/lastimport/";
    var next_book_url = "https://kindle.amazon.com/your_highlights/next_book";
    var amazon_signin_title = "Amazon.com Sign In";

    var module = {};
    module.isRunning = false;

    function get_next_book(){
        var get_params = {};

        if(offset !== null) { //null for the first request --> don't need to send any params
            get_params.used_asins = used_asins;
            get_params.upcoming_asins = upcoming_asins;
            get_params.current_offset = offset;
        }

        $.ajax({
            url: next_book_url,
            data: get_params, 
            dataType: 'html', 
            type: 'GET',
            timeout: 10000,
            success: function(data) {
                var title = $(data).filter('title').text().trim()
                if (title === amazon_signin_title){
                    // Handle Amazon Sign-in
                    var n = showKindleNotification('You must log in at kindle.amazon.com to sync your highlights');
                    var launchLoginPage = function(){
                        chrome.tabs.create({url: 'https://kindle.amazon.com/your_highlights/'})
                    }
                    n.onclick = launchLoginPage;
                    //n.onclose = launchLoginPage;
                } else {
                    processKindleData(data);
                }
            }
        });
    }

    function processKindleData(src){
        if (src === ""){
            console.log('No more kindle data to sync');
            closeImport();
            return;
        }

        var stage = $(src);
        var book = $(stage).filter('.bookMain')[0];

        var title = $(book).find('.title a')[0];
        title = $(title).text();

        var id = $(book).attr('id').split('_');
        var asin = id[0];
        offset = id[1];
        used_asins.push(asin);

        var upcoming = $(book).find('.upcoming')[0];
        upcoming_asins = $(upcoming).text().split(',');

        var highlights = stage.filter('.yourHighlight');
        var clips = [];
        $.each(highlights, function(n){
            var location_href = $(highlights[n]).find('a.readMore').attr('href');
            var kindle_location = location_href.match(/location=(\d+)/)[1];
            clips.push({
                'content': $(highlights[n]).find('.highlight').text(),
                'comment': $(highlights[n]).find('.noteContent').text(),
                'kindle_location': kindle_location
            });
        });

        var post_data = {
            'asin' : asin,
            'title' : title,
            'clips' : JSON.stringify(clips)
        }

        console.log("Posting " + clips.length + " clips from \"" + post_data.title + "\" (" + post_data.asin + ")");


        $.ajax({
            type: 'POST',
            dataType: 'json',
            url: post_url,
            data: post_data,
            timeout: 10000,
            success: function(data) {
                var new_highlights = data.result.new;
                highlight_total += new_highlights;
                if (new_highlights > 0){
                    books_with_highlights += 1;
                    get_next_book();
                } else {
                    // No new highlights, so we've reached a book that's already been
                    // sync'd. We can stop here.
                    closeImport();
                }
            },
            statusCode: {
                401: function() {
                    var n = showKindleNotification("You must log into findings to sync your kindle hightlights");
                    n.onclick = function(){
                        chrome.tabs.create({url: config.findingsBaseURL})
                        n.close();
                    }
                    closeImport();
                }
            },
            error: function(a, b, c){
                var n = showKindleNotification("There was an error syncing your kindle hightlights to findings. Please make sure you are logged in.");
                n.onclick = function(){
                    chrome.tabs.create({url: config.findingsBaseURL})
                    n.close();
                }
                closeImport();
            }
        });
    }

    function closeImport() {
        config.lastAmazonSyncDate = new Date();

        if (highlight_total > 0) {
            showKindleNotification('Imported ' + highlight_total + ' highlights from ' + books_with_highlights + ' books');
            $.get(
                notification_email_url,
                { 'since' : Math.floor(sync_start_time.getTime() / 1000) }
            )
        }

        module.isRunning = false;
        console.log("***** Amazon import complete.  Over and out. [" + config.lastAmazonSyncDate + "] *****");
    }

    module.sync = function() {
        // Reset module variables
        upcoming_asins = [];
        used_asins = [];
        offset = null;
        highlight_total = 0;
        sync_start_time = new Date();

        module.isRunning = true;
        get_next_book();
        console.log("***** Amazon import initiated at " + sync_start_time + "! *****");
    }

    return module;
})();
