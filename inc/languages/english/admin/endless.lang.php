<?php

// Installation
$l['endless'] = "Endless";
$l['endless_pluginlibrary_missing'] = "<a href=\"http://mods.mybb.com/view/pluginlibrary\">PluginLibrary</a> is missing. Please install it before doing anything else with Endless.";

// Settings 
$l['setting_group_endless'] = "Endless Settings";
$l['setting_group_endless_desc'] = "Here you can manage settings for Endless pagination, such as breakpoints to show the scrubber, how many items to load and others.";

$l['setting_endless_enable_scrubber'] = "Show scrubber";
$l['setting_endless_enable_scrubber_desc'] = "Decide whether or not to show the scrubber, an handful fixed box which helps browsing through posts and threads chronologically by displaying the current scrolling progress and the total items available. Its usage is very straightforward. If this setting is disabled, all scrubber-related settings will not have any effect.";

$l['setting_endless_postcount_breakpoint'] = "Post breakpoint to show scrubber";
$l['setting_endless_postcount_breakpoint_desc'] = "When posts count exceeds this value, the scrubber is automatically shown. Set this to 0 to always show the scrubber in showthread. Set this to a very high value to disable the scrubber for showthread entirely. Defaults to 20.";

$l['setting_endless_threadcount_breakpoint'] = "Thread breakpoint to show scrubber";
$l['setting_endless_threadcount_breakpoint_desc'] = "When threads count exceeds this value, the scrubber is automatically shown. Set this to 0 to always show the scrubber in forumdisplay. Set this to a very high value to disable the scrubber for forumdisplay entirely. Defaults to 100. <b>This is an experimental feature, as the scrubber has been tested only within threads (showthread)</b>.";

$l['setting_endless_disable_scrubber_when_single_page'] = "Disable scrubber for single-page resources";
$l['setting_endless_disable_scrubber_when_single_page_desc'] = "If enabled, the scrubber will not be shown on pages where items count does not exceed per-page settings, accounting for just a single-paged view (eg.: 17 posts where postsperpage setting is 20: posts will be displayed in a single page, and the scrubber will not be shown until other 4 replies are added).";