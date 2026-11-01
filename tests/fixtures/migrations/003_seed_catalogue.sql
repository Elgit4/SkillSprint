insert into public.learning_paths(id,title,description,level,sort_order,metadata) values
('web','HTML & CSS foundations','Build responsive pages from scratch.','Beginner',1,'{"color":"purple","icon":"</>"}'),
('programming','Programming logic','Think clearly and solve problems with code.','Beginner',2,'{"color":"lime","icon":"{ }"}'),
('database','Database basics','Model data and write useful queries.','Beginner',3,'{"color":"orange","icon":"SQL"}'),
('security','Cybersecurity essentials','Understand threats and safer systems.','Beginner',4,'{"color":"purple","icon":"⌘"}'),
('tools','Developer toolkit','Get comfortable with Git, GitHub and terminals.','Beginner',5,'{"color":"lime","icon":">_"}')
on conflict(id) do update set title=excluded.title,description=excluded.description,level=excluded.level,sort_order=excluded.sort_order,metadata=excluded.metadata;

insert into public.lessons(id,path_id,type,category,title,subtitle,body,content,reward_xp,sort_order) values
('html','web','multiple_choice','HTML basics','Give your page a headline','A quick win to get you building for the web.','HTML gives a webpage its structure. A heading introduces the main idea.','{"code":"<h1>Hello, world!</h1>\\n<p>I am learning to build for the web.</p>","question":"Which HTML tag creates the main heading on a page?","options":[{"id":"a","label":"<head>"},{"id":"b","label":"<h1>"},{"id":"c","label":"<title>"},{"id":"d","label":"<body>"}],"explanation":"The h1 element represents the main heading."}',25,1),
('debug','web','multiple_choice','HTML basics','Fix the broken profile card','Debugging is a skill. Spot the missing piece.','This paragraph opens but never closes. Which tag should you add?','{"code":"<h1>My profile</h1>\\n<p>I build things for the web.","question":"What closes the paragraph element?","options":[{"id":"a","label":"<p>"},{"id":"b","label":"</p>"},{"id":"c","label":"</h1>"},{"id":"d","label":"<br>"}],"explanation":"Closing tags use a forward slash."}',40,2),
('sql','database','multiple_choice','SQL basics','Ask a database for data','A tiny query, a useful skill.','SQL lets you retrieve information from tables.','{"code":"SELECT name\\nFROM students;","question":"Which SQL keyword retrieves rows from a table?","options":[{"id":"a","label":"UPDATE"},{"id":"b","label":"SELECT"},{"id":"c","label":"INSERT"},{"id":"d","label":"DELETE"}],"explanation":"SELECT retrieves data from one or more tables."}',25,1),
('logic','programming','multiple_choice','Programming logic','Predict what the code does','Build your problem-solving instincts.','A condition lets a program choose what to do.','{"code":"let score = 8;\\nif (score > 5) {\\n console.log(\\"Level up!\\");\\n}","question":"What will this code print?","options":[{"id":"a","label":"Try again"},{"id":"b","label":"Level up!"},{"id":"c","label":"8"},{"id":"d","label":"Nothing"}],"explanation":"The condition 8 > 5 is true, so the if block runs."}',35,1),
('security','security','multiple_choice','Cybersecurity','Choose the safer sign-in','Small habits make accounts harder to compromise.','Account security is strongest when you combine protective measures.','{"code":"Password + second factor = stronger sign-in","question":"Which is the strongest everyday choice?","options":[{"id":"a","label":"Reuse one password everywhere"},{"id":"b","label":"Use a unique password and MFA"},{"id":"c","label":"Share passwords with friends"},{"id":"d","label":"Turn off account alerts"}],"explanation":"A unique password limits reuse risk; MFA adds another verification step."}',35,1)
on conflict(id) do update set path_id=excluded.path_id,type=excluded.type,category=excluded.category,title=excluded.title,subtitle=excluded.subtitle,body=excluded.body,content=excluded.content,reward_xp=excluded.reward_xp,sort_order=excluded.sort_order;

insert into public.lesson_answer_keys(lesson_id,correct_answer) values
('html','"b"'::jsonb),('debug','"b"'::jsonb),('sql','"b"'::jsonb),('logic','"b"'::jsonb),('security','"b"'::jsonb)
on conflict(lesson_id) do update set correct_answer=excluded.correct_answer;

insert into public.achievements(id,name,description,event_type,threshold,criteria) values
('first-steps','First steps','Complete your first mission.','mission.completed',1,'{}'),
('on-a-roll','On a roll','Practice on three different days in a row.','streak.checkin',3,'{}'),
('bug-hunter','Bug hunter','Complete a debugging mission.','lesson.completed',1,'{"lesson_id":"debug"}'),
('data-explorer','Data explorer','Complete a SQL mission.','lesson.completed',1,'{"lesson_id":"sql"}')
on conflict(id) do update set name=excluded.name,description=excluded.description,event_type=excluded.event_type,threshold=excluded.threshold,criteria=excluded.criteria;
