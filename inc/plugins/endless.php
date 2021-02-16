<?php
/**
 * Endless
 *
 * Replaces regular pagination with an infinite scrollable page.
 *
 * @package Endless
 * @author  Shade <shad3-@outlook.com>
 * @license MIT https://opensource.org/licenses/MIT
 * @version beta 1
 */

if (!defined('IN_MYBB')) {
	die('Direct initialization of this file is not allowed.<br /><br />Please make sure IN_MYBB is defined.');
}

if (!defined("PLUGINLIBRARY")) {
	define("PLUGINLIBRARY", MYBB_ROOT . "inc/plugins/pluginlibrary.php");
}

function endless_info()
{
	return [
		'name' => 'Endless',
		'description' => 'Replaces regular pagination with an infinite scrollable page.',
		'website' => 'https://www.mybboost.com/forum-endless',
		'author' => 'Shade',
		'version' => 'beta 1',
		'compatibility' => '18*'
	];
}

function endless_is_installed()
{
	global $cache;

	$info      = endless_info();
	$installed = $cache->read("shade_plugins");
	if ($installed[$info['name']]) {
		return true;
	}
}

function endless_install()
{
	global $db, $mybb, $cache, $PL, $lang;

	if (!$lang->endless) {
		$lang->load('endless');
	}

	if (!file_exists(PLUGINLIBRARY)) {
		flash_message($lang->endless_pluginlibrary_missing, "error");
		admin_redirect("index.php?module=config-plugins");
	}

	// Add the plugin to our cache
	$info                        = endless_info();
	$shadePlugins                = $cache->read('shade_plugins');
	$shadePlugins[$info['name']] = [
		'title' => $info['name'],
		'version' => $info['version']
	];
	$cache->update('shade_plugins', $shadePlugins);

	$PL or require_once PLUGINLIBRARY;

	$settingsToAdd = [
		'enable_scrubber' => [
			'title' => $lang->setting_endless_enable_scrubber,
			'description' => $lang->setting_endless_enable_scrubber_desc,
			'value' => '1'
		],
		'postcount_breakpoint' => [
			'title' => $lang->setting_endless_postcount_breakpoint,
			'description' => $lang->setting_endless_postcount_breakpoint_desc,
			'value' => '20',
			'optionscode' => 'text'
		],
		'threadcount_breakpoint' => [
			'title' => $lang->setting_endless_threadcount_breakpoint,
			'description' => $lang->setting_endless_threadcount_breakpoint_desc,
			'value' => '100',
			'optionscode' => 'text'
		],
		'disable_scrubber_when_single_page' => [
			'title' => $lang->setting_endless_disable_scrubber_when_single_page,
			'description' => $lang->setting_endless_disable_scrubber_when_single_page_desc,
			'value' => '1'
		]
	];

	$PL->settings('endless', $lang->setting_group_endless, $lang->setting_group_endless_desc, $settingsToAdd);

	$stylesheet = file_get_contents(
		dirname(__FILE__) . '/Endless/stylesheets/endless.css'
	);
	$PL->stylesheet('endless.css', $stylesheet);

	// Add templates
	$dir       = new DirectoryIterator(dirname(__FILE__) . '/Endless/templates');
	$templates = [];
	foreach ($dir as $file) {
		if (!$file->isDot() AND !$file->isDir() AND pathinfo($file->getFilename(), PATHINFO_EXTENSION) == 'html') {
			$templates[$file->getBasename('.html')] = file_get_contents($file->getPathName());
		}
	}
	$PL->templates('endless', 'Endless', $templates);

}

function endless_uninstall()
{
	global $db, $cache, $PL, $lang;

	if (!$lang->endless) {
		$lang->load('endless');
	}

	if (!file_exists(PLUGINLIBRARY)) {
		flash_message($lang->endless_pluginlibrary_missing, "error");
		admin_redirect("index.php?module=config-plugins");
	}

	// Delete from cache
	$info         = endless_info();
	$shadePlugins = $cache->read('shade_plugins');
	unset($shadePlugins[$info['name']]);
	$cache->update('shade_plugins', $shadePlugins);

	$PL or require_once PLUGINLIBRARY;

	$PL->settings_delete('endless');
	$PL->stylesheet_delete('endless.css');
	$PL->templates_delete('endless');

}

if (defined('IN_ADMINCP')) {
	$plugins->add_hook("admin_load", "endless_ad");
}

$plugins->add_hook("xmlhttp", "endless_api");
$plugins->add_hook("forumdisplay_get_threads", "endless_forumdisplay_start_thread_number");
$plugins->add_hook("forumdisplay_thread_end", "endless_forumdisplay_update_thread_number");
$plugins->add_hook("forumdisplay_thread_end", "endless_reset_multipage");
$plugins->add_hook("showthread_end", "endless_reset_multipage");
$plugins->add_hook("newreply_do_newreply_end", "endless_add_continuous_quick_reply");
$plugins->add_hook("forumdisplay_end", "endless_forumdisplay_end");
$plugins->add_hook("showthread_end", "endless_showthread_end");
// Cache Endless templates
$plugins->add_hook("global_start", "endless_cache_templates");

// Advertising
function endless_ad()
{
	global $cache, $mybb;

	$info = endless_info();
	$plugins = $cache->read('shade_plugins');

	if (!in_array($mybb->user['uid'], (array) $plugins[$info['name']]['ad_shown'])) {

		flash_message('Thank you for using ' . $info['name'] . '! You might also be interested in other great plugins on <a href="https://www.mybboost.com">MyBBoost</a>, where you can also get support for ' . $info['name'] . ' itself.<br /><small>This message will not be shown again to you.</small>', 'success');

		$plugins[$info['name']]['ad_shown'][] = $mybb->user['uid'];
		$cache->update('shade_plugins', $plugins);

	}

}

function endless_cache_templates()
{
	global $templatelist;

	if ($templatelist) {
		$templatelist = explode(',', $templatelist);
	}
	else {
		$templatelist = [];
	}

	if (in_array(THIS_SCRIPT, ['forumdisplay.php', 'showthread.php'])) {

		$templatelist[] = 'endless_scrubber';

		if (THIS_SCRIPT == 'forumdisplay.php') {
			$templatelist[] = 'endless_placeholder_thread';
		}
		else {
			$templatelist[] = 'endless_placeholder_post';
		}

	}

	$templatelist = implode(',', array_filter($templatelist));
}

function endless_forumdisplay_start_thread_number()
{
	global $thread_number, $page, $perpage;

	$thread_number = (($page - 1) * $perpage);
}

function endless_forumdisplay_update_thread_number()
{
	global $thread_number, $thread;

	$thread_number++;
	$thread['multipage'] = '';
}

function endless_reset_multipage()
{
	global $multipage;

	$multipage = '';
}

function endless_api()
{
	global $mybb;

	// Set the mode
	$mode = $mybb->input['action'];

	if ($mybb->input['infinite'] != 1 or !in_array($mode, ['posts', 'threads'])) {
		return false;
	}

	global $db, $plugins;

	$data = [];

	$data['range'] = array_map('intval', (array) explode(',', $mybb->input['range']));
	$data['start'] = (int) min($data['range']) - 1;
	$data['end'] = (int) max($data['range']) - $data['start'];
	$perpage = 10;

	// Set the counter, used to sync with the placeholders added in the front-end
	$counter = $data['start'] + 1;

	// Context ID, either a fid or a tid
	$data['cid'] = (int) $mybb->input['cid'];

	$data = $plugins->run_hooks('endless_xmlhttp_start', $data);

	if ($data['range'] and $data['cid']) {

		$output = [];

		switch ($mode) {

			case 'posts':
			default:

				global $forum, $thread, $page, $forumpermissions, $postcounter, $templates;

				require_once MYBB_ROOT . 'inc/functions_post.php';

				$templatelist = "postbit,postbit_author_user,postbit_author_guest,postbit_avatar,postbit_find,postbit_pm,postbit_www,postbit_email,postbit_edit,postbit_quote,postbit_report,postbit_editedby,postbit_iplogged_show,postbit_iplogged_hiden,postbit_profilefield,postbit_attachments,postbit_attachments_attachment,postbit_attachments_thumbnails,postbit_attachments_images_image,postbit_attachments_images,postbit_status,postbit_inlinecheck,postbit_attachments_thumbnails_thumbnail,postbit_ignored,postbit_multiquote,postbit_attachments_attachment_unapproved,postbit_userstar,postbit_reputation_formatted_link,postbit_warninglevel_formatted,postbit_quickrestore,postbit_purgespammer,postbit_icon,postbit_editedby_editreason,postbit_gotopost,postbit_rep_button,postbit_warninglevel,postbit_profilefield_multiselect_value,postbit_profilefield_multiselect,postbit_deleted_member,postbit_away,postbit_warn,postbit_classic,postbit_reputation,postbit_deleted,postbit_offline,postbit_online,postbit_signature,postbit_editreason,postbit_quickdelete,postbit_groupimage,postbit_posturl,smilie";
				$templates->cache($db->escape_string($templatelist));

				$thread = get_thread($data['cid']);
				$forum = get_forum($thread['fid']);
				$forumpermissions = forum_permissions($thread['fid']);
				$ismod = (is_moderator($thread['fid'])) ? true : false;

				$page = (int) ($counter / $perpage) + 1;
				$postcounter = $data['start'];

				$pids = [];

				// Needs to be moved to preparsing (cutting off a query per call). Just leave it here for demo
				$query = $db->simple_select('posts', 'pid', 'tid = ' . $data['cid']);
				while ($pid = $db->fetch_field($query, 'pid')) {
					$pids[] = (int) $pid;
				}

				sort($pids);

				// Reverse the array to have a pid => number list
				$pidsToNumbers = array_flip($pids);

				$postsToLoad = [];

				// Now that we have a full list of the pids of this thread, determine which should be loaded
				foreach ($data['range'] as $number) {
					$postsToLoad[] = $pids[$number-1];
				}

				$postsToLoad = array_filter($postsToLoad);

				if ($postsToLoad) {

					// Work out if we are showing unapproved posts as well (if the user is a moderator etc.)
					if ($ismod && is_moderator($fid, "canviewdeleted") == true && is_moderator($fid, "canviewunapprove") == false) {
						$visible = "AND p.visible IN (-1,1)";
					}
					else if ($ismod && is_moderator($fid, "canviewdeleted") == false && is_moderator($fid, "canviewunapprove") == true) {
						$visible = "AND p.visible IN (0,1)";
					}
					else if ($ismod && is_moderator($fid, "canviewdeleted") == true && is_moderator($fid, "canviewunapprove") == true) {
						$visible = "AND p.visible IN (-1,0,1)";
					}
					else if ($forumpermissions['canviewdeletionnotice'] != 0 && $ismod == false) {
						$visible = "AND p.visible IN (-1,1)";
					}
					else {
						$visible = "AND p.visible='1'";
					}

					// Get the posts
					$query = $db->query('
						SELECT u.*, u.username AS userusername, p.*, f.*, eu.username AS editusername
						FROM '.TABLE_PREFIX.'posts p
						LEFT JOIN '.TABLE_PREFIX.'users u ON (u.uid=p.uid)
						LEFT JOIN '.TABLE_PREFIX.'userfields f ON (f.ufid=u.uid)
						LEFT JOIN '.TABLE_PREFIX.'users eu ON (eu.uid=p.edituid)
						WHERE p.pid IN (' . implode(',', $postsToLoad) . ") {$visible}
					");

					$key = 0;

					while ($post = $db->fetch_array($query)) {

						// Add the corresponding front-end number to sync the post with the placeholder.
						// Once we move the pids to preparsing, this should not be necessary anymore
						$key = $pidsToNumbers[$post['pid']] + 1;
						$postcounter = $key - 1;

						$output[$key]['content'] = build_postbit($post);

						// QuickReferences support
						if (function_exists('quickreferences_fill_placeholders')) {
							$output[$key]['content'] = quickreferences_fill_placeholders($output[$key]['content']);
						}

						$output[$key]['id'] = $post['pid'];

					}

				}

				break;

			case 'threads':

				global $forum, $thread, $page, $fpermissions, $fid, $parser, $templates, $forum_read, $read_cutoff;
				global $threadcache, $lang, $inlinemod, $inlinemodcol, $ismod, $foruminfo;

				$templatelist = 'forumdisplay_inlinemoderation_col,forumdisplay_thread_icon,forumdisplay_thread_sep,forumdisplay_sticky_sep,forumdisplay_thread_rating_moved,forumdisplay_thread_rating,forumdisplay_thread_modbit,forumdisplay_thread_gotounread,forumdisplay_thread_unapproved_posts,forumdisplay_thread_attachment_count,forumdisplay_thread_deleted,forumdisplay';
				$templates->cache($db->escape_string($templatelist));

				$lang->load('forumdisplay');

				require_once MYBB_ROOT . 'inc/class_parser.php';
				$parser = new postParser;

				$fid = $data['cid'];
				$fpermissions = forum_permissions($fid);
				$foruminfo = get_forum($fid);

				if ($mybb->settings['threadreadcut'] > 0 and $mybb->user['uid']) {

					$query = $db->simple_select("forumsread", "dateline", "fid='{$fid}' AND uid='{$mybb->user['uid']}'");
					$forum_read = $db->fetch_field($query, "dateline");

					$read_cutoff = TIME_NOW-$mybb->settings['threadreadcut']*60*60*24;
					if ($forum_read == 0 or $forum_read < $read_cutoff) {
						$forum_read = $read_cutoff;
					}

				}
				else {

					$forum_read = my_get_array_cookie("forumread", $fid);

					if (isset($mybb->cookies['mybb']['readallforums']) and !$forum_read) {
						$forum_read = $mybb->cookies['mybb']['lastvisit'];
					}

				}

				if (is_moderator($fid)) {

					eval("\$inlinemodcol = \"".$templates->get("forumdisplay_inlinemoderation_col")."\";");
					$ismod = true;
					$inlinecount = "0";
					$inlinemod = '';
					$inlinecookie = "inlinemod_forum".$fid;
				}
				else {
					$inlinemod = $inlinemodcol = '';
					$ismod = false;
				}

				$tids = [];

				// Need to be moved to preparsing (cutting off a query per call). Just leave it here for demo
				$query = $db->simple_select('threads', 'tid', 'fid = ' . $data['cid'], ['order_by' => 'sticky DESC, lastpost DESC']);
				while ($tid = $db->fetch_field($query, 'tid')) {
					$tids[] = (int) $tid;
				}

				// Reverse the array to have a tid => number list
				$tidsToNumbers = array_flip($tids);

				$threadsToLoad = [];

				// Now that we have a full list of the pids of this thread, determine which should be loaded
				foreach ($data['range'] as $number) {
					$threadsToLoad[] = $tids[$number-1];
				}

				$threadsToLoad = array_filter($threadsToLoad);

				if ($threadsToLoad) {

					$query = $db->query('
						SELECT t.*, u.uid, u.username AS threadusername
						FROM ' . TABLE_PREFIX . 'threads t
						LEFT JOIN ' . TABLE_PREFIX . 'users u ON u.uid = t.uid
						WHERE t.tid IN (' . implode(',', $threadsToLoad) . ')
					');

					$key = 0;

					while ($thread = $db->fetch_array($query)) {
						$threadcache[] = $thread;
					}

					foreach ($threadcache as $thread) {

						// Add the corresponding front-end number to sync the post with the placeholder.
						// Once we move the tids to preparsing, this should not be necessary anymore
						$key = $tidsToNumbers[$thread['tid']] + 1;

						$output[$key]['content'] = endless_build_threadbit($thread);

						$output[$key]['id'] = $thread['tid'];

					}

				}

				break;

		}

		$output = $plugins->run_hooks('endless_xmlhttp_end', $output);

		if ($output) {

			echo json_encode($output);
			exit;

		}

	}

	echo json_encode("Error");
	exit;

}

function endless_build_threadbit($thread)
{
	global $mybb, $fpermissions, $parser, $lang, $templates, $theme, $fid, $forum_read, $read_cutoff, $plugins;
	global $flp_avatar, $flp_firstpost, $flp_lastpost, $threadcache, $inlinemod, $inlinemodcol, $ismod, $foruminfo;

	$plugins->run_hooks("forumdisplay_thread");

	$threads = '';

	$moved = explode("|", $thread['closed']);

	if ($thread['visible'] == 0) {
		$bgcolor = "trow_shaded";
	}
	else if ($thread['visible'] == -1 and is_moderator($fid, "canviewdeleted")) {
		$bgcolor = "trow_shaded trow_deleted";
	}
	else {
		$bgcolor = alt_trow();
	}

	if ($thread['sticky'] == 1) {
		$thread_type_class = " forumdisplay_sticky";
	}
	else {
		$thread_type_class = " forumdisplay_regular";
	}

	$folder = '';
	$prefix = '';

	$thread['author'] = $thread['uid'];
	if (!$thread['username']) {
		$thread['username'] = $thread['profilelink'] = htmlspecialchars_uni($thread['threadusername']);
	}
	else {
		$thread['username'] = htmlspecialchars_uni($thread['username']);
		$thread['profilelink'] = build_profile_link($thread['username'], $thread['uid']);
	}

	// If this thread has a prefix, insert a space between prefix and subject
	$thread['threadprefix'] = $threadprefix = '';
	if ($thread['prefix'] != 0) {
		$threadprefix = build_prefixes($thread['prefix']);
		if (!empty($threadprefix)) {
			$thread['threadprefix'] = $threadprefix['displaystyle'].'&nbsp;';
		}
	}

	$thread['subject'] = $parser->parse_badwords($thread['subject']);
	$thread['subject'] = htmlspecialchars_uni($thread['subject']);

	if ($thread['icon'] > 0 and $icon_cache[$thread['icon']])
	{
		$icon = $icon_cache[$thread['icon']];
		$icon['path'] = str_replace("{theme}", $theme['imgdir'], $icon['path']);
		$icon['path'] = htmlspecialchars_uni($icon['path']);
		$icon['name'] = htmlspecialchars_uni($icon['name']);
		eval("\$icon = \"".$templates->get("forumdisplay_thread_icon")."\";");
	}
	else
	{
		$icon = "&nbsp;";
	}

	$prefix = '';
	if ($thread['poll'])
	{
		$prefix = $lang->poll_prefix;
	}

	if ($thread['sticky'] == "1" and !isset($donestickysep))
	{
		eval("\$threads .= \"".$templates->get("forumdisplay_sticky_sep")."\";");
		$shownormalsep = true;
		$donestickysep = true;
	}
	else if ($thread['sticky'] == 0 and !empty($shownormalsep))
	{
		eval("\$threads .= \"".$templates->get("forumdisplay_threads_sep")."\";");
		$shownormalsep = false;
	}

	$rating = '';
	if ($mybb->settings['allowthreadratings'] != 0 and $foruminfo['allowtratings'] != 0)
	{
		if ($moved[0] == "moved" or ($fpermissions['canviewdeletionnotice'] != 0 and $thread['visible'] == -1))
		{
			eval("\$rating = \"".$templates->get("forumdisplay_thread_rating_moved")."\";");
		}
		else
		{
			$thread['averagerating'] = (float)round($thread['averagerating'], 2);
			$thread['width'] = (int)round($thread['averagerating'])*20;
			$thread['numratings'] = (int)$thread['numratings'];

			$not_rated = '';
			if (!isset($thread['rated']) or empty($thread['rated']))
			{
				$not_rated = ' star_rating_notrated';
			}

			$ratingvotesav = $lang->sprintf($lang->rating_votes_average, $thread['numratings'], $thread['averagerating']);
			eval("\$rating = \"".$templates->get("forumdisplay_thread_rating")."\";");
		}
	}

	$thread['pages'] = 0;
	$thread['multipage'] = '';
	$threadpages = '';
	$morelink = '';
	$thread['posts'] = $thread['replies'] + 1;

	if ($thread['unapprovedposts'] > 0 and $ismod) {
		$thread['posts'] += $thread['unapprovedposts'] + $thread['deletedposts'];
	}

	if ($ismod) {

		if (isset($mybb->cookies[$inlinecookie]) and my_strpos($mybb->cookies[$inlinecookie], "|{$thread['tid']}|")) {

			$inlinecheck = "checked=\"checked\"";
			++$inlinecount;

		}
		else {
			$inlinecheck = '';
		}

		$multitid = $thread['tid'];
		eval("\$modbit = \"".$templates->get("forumdisplay_thread_modbit")."\";");

	}
	else {
		$modbit = '';
	}

	if ($moved[0] == "moved") {

		$prefix = $lang->moved_prefix;
		$thread['tid'] = $moved[1];
		$thread['replies'] = "-";
		$thread['views'] = "-";

	}

	$thread['threadlink'] = get_thread_link($thread['tid']);
	$thread['lastpostlink'] = get_thread_link($thread['tid'], 0, "lastpost");

	// Determine the folder
	$folder = '';
	$folder_label = '';

	if (isset($thread['doticon'])) {
		$folder = "dot_";
		$folder_label .= $lang->icon_dot;
	}

	$gotounread = '';
	$isnew = 0;
	$donenew = 0;

	if ($mybb->settings['threadreadcut'] > 0 and $mybb->user['uid'] and $thread['lastpost'] > $forum_read) {

		if (!empty($thread['lastread'])) {
			$last_read = $thread['lastread'];
		}
		else {
			$last_read = $read_cutoff;
		}

	}
	else {
		$last_read = my_get_array_cookie("threadread", $thread['tid']);
	}

	if ($forum_read > $last_read) {
		$last_read = $forum_read;
	}

	if ($thread['lastpost'] > $last_read and $moved[0] != "moved") {

		$folder .= "new";
		$folder_label .= $lang->icon_new;
		$new_class = "subject_new";
		$thread['newpostlink'] = get_thread_link($thread['tid'], 0, "newpost");
		eval("\$gotounread = \"".$templates->get("forumdisplay_thread_gotounread")."\";");
		$unreadpost = 1;

	}
	else {

		$folder_label .= $lang->icon_no_new;
		$new_class = "subject_old";

	}

	if ($thread['replies'] >= $mybb->settings['hottopic'] or $thread['views'] >= $mybb->settings['hottopicviews']) {

		$folder .= "hot";
		$folder_label .= $lang->icon_hot;

	}

	if ($thread['closed'] == 1) {

		$folder .= "lock";
		$folder_label .= $lang->icon_lock;

	}

	if ($moved[0] == "moved") {

		$folder = "move";
		$gotounread = '';

	}

	$folder .= "folder";

	$inline_edit_tid = $thread['tid'];

	// If this user is the author of the thread and it is not closed or they are a moderator, they can edit
	$inline_edit_class = '';
	if (($thread['uid'] == $mybb->user['uid'] and $thread['closed'] != 1 and $mybb->user['uid'] != 0 and $can_edit_titles == 1) or $ismod == true) {
		$inline_edit_class = "subject_editable";
	}

	$lastposter = htmlspecialchars_uni($thread['lastposter']);
	$lastposteruid = $thread['lastposteruid'];
	$lastpostdate = my_date('relative', $thread['lastpost']);

	// Don't link to guest's profiles (they have no profile).
	if ($lastposteruid == 0)
	{
		$lastposterlink = $lastposter;
	}
	else
	{
		$lastposterlink = build_profile_link($lastposter, $lastposteruid);
	}

	$thread['replies'] = my_number_format($thread['replies']);
	$thread['views'] = my_number_format($thread['views']);

	// Threads and posts requiring moderation
	if ($thread['unapprovedposts'] > 0 and is_moderator($fid, "canviewunapprove")) {

		if ($thread['unapprovedposts'] > 1) {
			$unapproved_posts_count = $lang->sprintf($lang->thread_unapproved_posts_count, $thread['unapprovedposts']);
		}
		else {
			$unapproved_posts_count = $lang->sprintf($lang->thread_unapproved_post_count, 1);
		}

		$thread['unapprovedposts'] = my_number_format($thread['unapprovedposts']);
		eval("\$unapproved_posts = \"".$templates->get("forumdisplay_thread_unapproved_posts")."\";");

	}
	else {
		$unapproved_posts = '';
	}

	// If this thread has 1 or more attachments show the paperclip
	if ($mybb->settings['enableattachments'] == 1 and $thread['attachmentcount'] > 0) {

		if ($thread['attachmentcount'] > 1) {
			$attachment_count = $lang->sprintf($lang->attachment_count_multiple, $thread['attachmentcount']);
		}
		else {
			$attachment_count = $lang->attachment_count;
		}

		eval("\$attachment_count = \"".$templates->get("forumdisplay_thread_attachment_count")."\";");
	}
	else {
		$attachment_count = '';
	}

	if ($fpermissions['canviewdeletionnotice'] != 0 and $thread['visible'] == -1 and !is_moderator($fid, "canviewdeleted")) {
		eval("\$threads .= \"".$templates->get("forumdisplay_thread_deleted")."\";");
	}
	else {
		eval("\$threads .= \"".$templates->get("forumdisplay_thread")."\";");
	}

	return $threads;
}

function endless_add_continuous_quick_reply()
{
	$GLOBALS['mybb']->input['from_page'] = pow(10, 10);
}

function endless_forumdisplay_end()
{
	global $mybb, $threadcount, $foruminfo, $page, $pages, $headerinclude;

	$opts = [
		'lastNode' => $threadcount,
		'cid' => $foruminfo['fid'],
		'page' => $page,
		'itemsShownPerPage' => $mybb->settings['threadsperpage']
	];

	$breakpoint = ($mybb->settings['endless_threadcount_breakpoint']) ? $mybb->settings['endless_threadcount_breakpoint'] : 100;

	if ($mybb->settings['endless_enable_scrubber'] and $threadcount > $breakpoint) {
		$opts['enableScrubber'] = true;
	}

	if ($mybb->settings['endless_disable_scrubber_when_single_page'] and $pages == 1) {
		unset($opts['enableScrubber']);
	}

	$headerinclude .= endless_load_javascript($opts);
}

function endless_showthread_end()
{
	global $mybb, $thread, $page, $pages, $headerinclude;

	$opts = [
		'lastNode' => $thread['replies'] + 1,
		'cid' => $thread['tid'],
		'page' => $page,
		'itemsShownPerPage' => $mybb->settings['postsperpage']
	];

	$breakpoint = ($mybb->settings['endless_postcount_breakpoint']) ? $mybb->settings['endless_postcount_breakpoint'] : 20;

	if ($mybb->settings['endless_enable_scrubber'] and ($thread['replies'] + 1) > $breakpoint) {
		$opts['enableScrubber'] = true;
	}

	if ($mybb->settings['endless_disable_scrubber_when_single_page'] and $pages == 1) {
		unset($opts['enableScrubber']);
	}

	$headerinclude .= endless_load_javascript($opts);
}

function endless_load_javascript($options = [])
{
	global $templates, $lang;

	$options = json_encode($options);

	$endless_templates = json_encode([
		'post' => stripslashes($templates->get('endless_placeholder_post')),
		'thread' => stripslashes($templates->get('endless_placeholder_thread')),
		'scrubber' => stripslashes($templates->get('endless_scrubber'))
	]);

	return <<<HTML
<script type="text/javascript" src="jscripts/endless.min.js"></script>
<script type="text/javascript">

	Endless.templates = {$endless_templates};
	Endless.lang = {
		months: {
			0: 'Jan',
			1: 'Feb',
			2: 'Mar',
			3: 'Apr',
			4: 'May',
			5: 'Jun',
			6: 'Jul',
			7: 'Aug',
			8: 'Sep',
			9: 'Oct',
			10: 'Nov',
			11: 'Dec'
		}
	};

	$(document).ready(function() {
		Endless.init($options);
	});

</script>
HTML;
}
