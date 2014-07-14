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
        onPageClick: function(pageNumber) {
            showFiles(pageNumber);
        }
    });

    function refreshFiles(pageNumber) {
        pageNumber = typeof pageNumber !== 'undefined' ? pageNumber : 1;

        $('#pagination').pagination('drawPage', pageNumber);

        $.getJSON('/files', function(data) {
            filesData = {};
            filesData = data;

            $('#pagination').pagination('updateItems', data.length);

            showFiles(pageNumber);
        });
    }

    function showFiles(pageNumber) {
        var files = $('.file');
        if (files.length) {
            files.each(function(index, element) {
                element.remove();
            })
        }

        var jlist = $("#list");

        filesData.slice(((pageNumber - 1) * itemsOnPage), (pageNumber * itemsOnPage)).reverse()
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
                j.children('a').attr('href', path);

                if (/^(video|image)\//.test(file.type)) {
                    j.find('.icon').empty().append($('<img/>').attr('src', '/thumbnail' + path))
                    
                    if (/^image\//.test(file.type)) {
                        details += "<br/><a href='/resize/640/480" + path + "'>x480</a> - <a href='/resize/1280/720" + path + "'>x720</a> - <a href='/resize/1920/1080" + path + "'>x1080</a>";
                    }
                }

                var button = $('<br/><button type="button" class="btn btn-xs btn-link">Remove</button>');
                button.click(function() {
                    if (confirm("Do you really want to remove \"" + file.name + "\"? It's a good file.")) {
                        $.getJSON('/remove' + path, function(data) {
                            j.remove();
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
