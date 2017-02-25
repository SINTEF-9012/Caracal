/*jslint unparam: true */
/*global window, $ */
$(function() {
    'use strict';

    var jbody = $(document.body),
        progressBar = $('#progress'),
        fileOk = $('#file-ok').remove().show(),
        fileExists = $('#file-exists').remove().show(),
        listFile = $('#list-file').remove().show(),
        itemsOnPage = 10,
        filesData = {};

    var dragTimer = 0;
    // http://stackoverflow.com/questions/6848043/how-do-i-detect-a-file-is-being-dragged-rather-than-a-draggable-element-on-my-pa
    $(document).on('dragover', function(e) {
        var dt = e.originalEvent.dataTransfer;
        if (dt.types != null && (dt.types.indexOf ? dt.types.indexOf('Files') != -1 : dt.types.contains('application/x-moz-file'))) {

            jbody.addClass('dragover');

            if (dragTimer) {
                window.clearTimeout(dragTimer);
                dragTimer = 0;
            }
        }
    }).on('dragleave drop', function(e) {
        if (!dragTimer) {
            dragTimer = window.setTimeout(function() {
                jbody.removeClass('dragover');
                dragTimer = 0;
            }, 25);
        }
    });

    var endTimer = 0;

    // Change this to the location of your server-side upload handler:
    $('#fileupload').fileupload({
        url: '/upload',
        dataType: 'json',
        autoUpload: true,
        done: function(e, data) {
            if (data.result.status === 'exists') {
                fileExists.clone().children('strong').text(data.result.name).parent().appendTo('#files');
            } else {
                fileOk.clone().children('strong').text(data.result.name).parent().appendTo('#files');
            }

            if (!endTimer) {
                endTimer = window.setTimeout(function() {
                    refreshFiles();
                    endTimer = 0;
                }, 250);
            }
        },
        progressall: function(e, data) {
            var progress = parseInt(data.loaded / data.total * 100, 10);
            $('#progress .progress-bar').css(
                'width',
                progress + '%'
            );
        },
        start: function() {
            progressBar.removeClass('nothing-to-show');
        },
        stop: function() {
            progressBar.addClass('nothing-to-show');
        }
    })
        .prop('disabled', !$.support.fileInput)
        .parent().addClass($.support.fileInput ? undefined : 'disabled');

    function bytesToSize(bytes) {
        var sizes = ['bytes', 'Kb', 'Mb', 'Gb', 'Tb'];
        if (bytes == 0) return '0 Bytes';
        var i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
        return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
    };

    $('#pagination').pagination({
        itemsOnPage: itemsOnPage,
        cssStyle: 'pagination',
        prevText: '&laquo;',
        nextText: '&raquo;',
        displayedPages: 8,
        onPageClick: function(pageNumber) {
            refreshFiles(pageNumber);
        }
    });

    function refreshFiles(pageNumber) {


        pageNumber = typeof pageNumber !== 'undefined' ? pageNumber : 0;

        $('#list').empty();

        if (pageNumber > 0) {
            $('#pagination').pagination('drawPage', pageNumber);
        }

        $.getJSON('/paginateFiles/'+(pageNumber-1), {pageSize: itemsOnPage},function(data) {
            filesData = data.files;

            $('#pagination').pagination('updateItems', data.count);
            if (pageNumber === 0) {
                $('#pagination').pagination('drawPage', Math.ceil(data.count/itemsOnPage));
            }


            showFiles(pageNumber);
        });
    }

    function showFiles(pageNumber) {

        var jlist = $("#list");

        jlist.empty();

        filesData.reverse()
            .forEach(function(file) {
                var path = '/' + file.hash + '.' + file.extension;

                if (document.getElementById(path)) {
                    return;
                }

                var j = listFile.clone();
                j.find('.name').text(file.name);

                var date = new Date(file.mtime);

                var details = date.toLocaleString() + "<br/>" + bytesToSize(file.size);

                j.attr('id', path);

                var fileId = file.id;
                var pathUsingId = '/' + file.id;

                if (!fileId) {
                	fileId = file.hash + '.' + file.extension;
                	pathUsingId = path;
                }

                j.children('a').attr('href', pathUsingId);

                if (/^(video|image)\//.test(file.type)) {
                    j.find('.icon').empty().append($('<img/>').attr('src', '/thumbnail' + path))
                    
                    if (/^image\//.test(file.type)) {
                        details += "<br/><a href='/resize/640/480/" + fileId + "'>x480</a> - <a href='/resize/1280/720/" + fileId + "'>x720</a> - <a href='/resize/1920/1080/" + fileId + "'>x1080</a>";
                    } else {
                        details += "<br/><a href='/convert/mp4/480/" + fileId + "'>mp4 x480</a> - <a href='/convert/mp4/720/" + fileId + "'>mp4 x720</a> - <a href='/convert/mp4/1080/" + fileId + "'>mp4 x1080</a>"
                            + "<br/><a href='/convert/webm/480/" + fileId + "'>webm x480</a> - <a href='/convert/webm/720/" + fileId + "'>webm x720</a> - <a href='/convert/webm/1080/" + fileId + "'>webm x1080</a>";
                    }
                }

                var button = $('<br/><button type="button" class="btn btn-xs btn-link">Remove</button>');
                button.click(function() {

                    if (!window.sessionStorage) {
                        window.sessionStorage = {};
                    }

                    if (!window.sessionStorage.deletionsKey) {
                        window.sessionStorage.deletionsKey = window.prompt("Please provide the deletions key");
                    }

                    if (confirm("Do you really want to remove \"" + file.name + "\"? It's a good file.")) {
                        $.getJSON('/remove' + path, {
                            key: window.sessionStorage.deletionsKey
                        }, function(data) {
                            j.remove();
                        }).fail(function(e) {
                            delete window.sessionStorage.deletionsKey;
                            alert("Error: "+e.responseText);
                        });
                    }
                });

                j.find('.details small').html(details)
                    .append(button);

                jlist.prepend(j);
            });

    }

    refreshFiles(window.location.hash.split('-')[1]);

    var fetchUrlInput = $('#fetchUrlInput');
    $('#fetchForm').submit(function(e) {
        e.preventDefault();

        var url = fetchUrlInput.val();

        if (!/^https?:\/\//.test(url)) {
            url = 'http://' + url;
        }

        $.get('/fetch/' + url, function(data) {
            fetchUrlInput.val('').focus();
            refreshFiles();
        });
    });

});
