
Category Archives: Performance
Performance, Scripting
Optimized Load Script Patterns
Feb 17, 2026 4 Comments

While we have an increasing number of methods to create Qlik Data Models, most are still created using plain old script and we care about the elapsed runtime of the script.

Qlik QVD files load very fast when loaded in “optimized mode”. An optimized load can transfer the data from disk directly to Qlik’s internal memory format and is generally about 10x faster than a non-optimized load. A QVD is loaded optimized if:

    No fields are added
    No field transformation
    No Where clause except for single parameter Exists(), or two parameter Exists() where both fields are in this Load.
    Field Rename using AS is allowed

There are some common script requirements, e.g. filtering a QVD on a year value, that will break the optimization. What follows are some typical scenarios and script patterns to help you maintain optimized Loads.

Script patterns that let you maintain optimized Load can be:

    Use Where Exists() to select rows. Subsetting with Join is possible but slower and uses more memory.
    Use a subsequent Load Resident to add calculated fields.
    AutoNumber statement
    Touchless formatting vs inline formatting.

Selecting QVD Rows

The optimal pattern for filtering rows from a QVD is to load a temp table with values and filter the QVD load using Where Exists(field).

TempYear:
LOAD * INLINE [
Year
2022
2023
];

Data:
LOAD * 
FROM [lib://data/sales.qvd] (qvd)
Where Exists(Year)

A slower option that allows for more conditions is an Inner Join.

Data:
LOAD * 
FROM [lib://data/sales.qvd] (qvd);

INNER JOIN (Data) LOAD * INLINE [
Year, Region
2022, US
2023, US
];

When you want two separate tables that contain only intersecting rows with multiple fields, you can’t use Where Exists(field). Instead use the Keep prefix.

For example, Table “RepairOrders” has already been loaded. “RepairOrders” contains fields ModelId and PartId, linking to “PartsMaster.qvd”. Load matching rows from PartsMaster as a separate table, keeping the load optimized.

PartsMaster:
LEFT KEEP(RepairOrders)
LOAD * 
FROM [lib://data/ParstMaster.qvd] (qvd);

Subsequent Load Resident

Create additional derived fields in a Load Resident after the optimized QVD Load.

TempSales:
LOAD *  
FROM [lib://data/sales.qvd] (qvd);

Sales:
LOAD *,
  Total - Cost as Margin
Resident TempSales;

Drop Table TempSales;

If you are certain your table contains no duplicate rows, you can create the new fields using Join instead of creating a new table:

Join (Sales) LOAD *,
  Total - Cost as Margin 
Resident Sales;

AutoNumber Statement

It’s usually a good idea to AutoNumber key fields to save memory. Don’t use the AutoNumber() function in a Load. Instead use the AutoNumber statement at the end of the script.

AutoNumber *fieldlist;

Note that you can use wildcards in the fieldname. This is really handy if your keyfields follow a naming pattern like “Key*”.
Touchless Formatting

“Touchless formatting” is my invented term for the technique of formatting fields by using a temp format table. This is useful when you need to change or set specific date or number formats for a QVD fields. If you add the formatting function to the QVD Load, you lose the optimized Load. You can read more about Touchless Formatting here.

Here is an example of changing the EU format dates in QVD fields to US format dates.

// Load some dummy fields just to assign formats
TempFormatTable:
LOAD
 Date(0, 'MM/DD/YYYY') as OrderDate,
 Date(0, 'MM/DD/YYYY') as ShipDate,
 Num(0, '#,##0.00') as OrderTotal
AutoGenerate 1;

Facts: // Load the QVD
LOAD * FROM [lib://data/OrdersEU.qvd] (qvd);

DROP TABLE TempFormatTable;  // Drop temp table

I hope you’ve found these tips a useful reference. Happy Scripting!
Facebook
Twitter
LinkedIn
RedditShare
Performance, Productivity, QSDA, Uncategorized
Reducing Qlik Field Memory
Nov 14, 2024 4 Comments

Summary: A look at techniques to reduce the memory footprint of your Qlik Data Models.

There are good reasons to reduce the memory footprint of your Qlik Apps. Smaller Apps tend to perform better and require fewer server resources. Qlik Cloud imposes size quotas and there is a financial cost to exceeding the quota.

In this post we’ll look at techniques to reduce the memory requirements of your data model.

First, lets review how Qlik Sense stores App data in memory.

The Qlik Load script transforms your data into two types of internal data structures.

A Symbol Table is created for each field. The Symbol table contains a list of the distinct values of this field. The overall size of the symbol table is therefore a function of how many values and the width of the values.

Logical Tables are the tables we see created in the data model, i.e. fact and dimension tables. The Logical tables contain one row for each row of data. The tables do not contain the field values directly. Rather they contain a pointer to a value in the associated Symbol table. This pointer is sometime called an Index.

The width of a pointer is the number of bits required to index the number of values in the Symbol table. For example, in the image above we have 5 values for “Year”. This would require 3 bits as 2^3 is 8, which would cover the required 5 values. 2^2 would be too small as that would only cover 4 values.

My QSDA Pro tool shows the memory required for each field, including a breakdown by Symbol and Index.

There are other tools to view field sizes such as Qlik Cloud App Performance Analyzer, Qlik Cloud App Analyzer and App Metadata Analyzer for Qlik client-managed. In my experience all of these report only on symbol space per field, not index space.

I’m going to use QSDA Pro for my demonstrations in this article.

Using less memory for fields involves reducing the size of the symbol table, the index, or both. There are four techniques we can employ to reduce field memory:

    Eliminate the field
    Reduce the number of field values
    Optimize field values to reduce width, including AutoNumber
    Reduce the number of rows

Let’s look at each of these options.
Eliminate the field

Removing the field from the data model is the easiest way to reduce memory :). Of course this is only viable if the field is not used by your application. To determine if a field is used, you must consider all the places a field may be referenced — master items, variables, charts, bookmarks, etc — for both public and private content. Fortunately, QSDA scans all public and private content and makes the inuse determination for you.

In some cases you will not want to drop a field as you anticipate it being used in the future. The benefit from removing fields is relative to the size of the field. When considering whether you want to drop a field, look to the largest fields first where you will gain the most benefit.

QSDA Drop Unused Fields Dialog
Reduce the number of field values

Reducing the number of distinct values will reduce both symbol and index space. How might we do this?

A common scenario involves timestamps. For example let’s look at a field named “ShipTime” which displays in our app as hh:mm:ss, reporting the time an order was shipped. The analysis requirement is that occasionally an analyst will need to see this value in an order detail chart. This field has 459,918 distinct values. Something seems off. There are only 86,400 possible hh:mm:ss values per day and we only ship during one shift so I would expect to see no more than 28,800 values.

When I examine the values in the app I discover the field contains an entire Datetime value and the display format hh:mm:ss is being used in the chart. I don’t need the date portion. I’ll use the Frac() function in the script to extract just the time.

Reload followed by a new QSDA Analysis and here’s the result below. A massive reduction in distinct values and associated savings in both symbol and index. This reduces the total memory for this field from 5200KB to 345KB.

Another potential scenario for this field is that the original developer required both the date and time. In this case our approach is to split the datetime into separate Date and Time fields like this. Remember that formatting functions like Date() and Time() do not change values, we must use numeric functions like Floor() and Frac().

If I need to display the “Ship timestamp” in a chart, I’ll do it like this in the chart:

ShipDate & ' ' & ShipTime

A QSDA analysis now shows a total of 863KB for both fields. A big reduction from 5200KB!

Other potential ways to reduce the number of values:

    Drop seconds or fractions from Time fields.

    Some accounting systems return fractional amounts, or you may have unneeded fractions due to a calculation. Round the final amount to the penny or appropriate magnitude. 

Optimize field values to reduce width

Reducing the width of the field values decreases the Symbol space but not the Index space. How can we reduce the width of a value without changing the business meaning of the value? Isn’t a value a value?

We’ll start with the easy way — AutoNumber. The AutoNumber statement (and AutoNumber function) translates values into a set of sequential integers. This is useful for compacting key values. We typically don’t need to see the key values, we just need to them to link our tables together.

AutoNumbering a field is done by adding this statement at the end of your script:

Here’s the before and after sizes for SalesOrderDetailID, showing a total reduction of 143MB.
Before AutoNumber
After AutoNumber

Note that the symbol space has been completely eliminated! When the symbol set consists of sequential integers, Qlik does not store the symbols. Instead, the index value is used as a proxy for the symbol value.

Now we need to dive a bit deeper into the actual format of a symbol table. The symbol table diagram at the top of this post is a bit of a simplification.

Generally speaking, strictly numeric values can be stored in 8 byte cells. For a field that contains only numeric values the symbol table is an array of 8 byte values.

We can index to the nth value simply by multiplying by 8. This is a very efficient and compact storage format. In QSDA these fields will show an Average Symbol Width of 8.00.
QSDA Fields

For fields that contain strings, the symbol table layout is a bit different. As strings can be of varying length, an array of fixed cells won’t do. If there are any strings in the field, the entire field is considered “mixed”.

The symbol table for a mixed field is an array of 4 byte pointers that point to symbol values elsewhere in memory. The values consists of:

    1 byte flag
    The varying length string
    1 byte null terminator

The total symbol space for a string is 6 bytes plus the length of the string. The storage for string “a” would be 7 bytes.

Looking at the “LastName” field in the image above, we know that each symbols value carries a 6 byte overhead. We can infer that the average length of the LastName strings is 6.54. That is, 12.54 – 6.

When the value is a Dual() value, the symbol value picks up an extra 4 or 8 bytes to hold the numeric value. 4 bytes is used for integers, 8 for decimal values.

The total symbol space for a dual value is 6 bytes plus the length of the string, plus 4 or 8 bytes.

A field may contain both string and dual types. Dual is a value attribute, not a field attribute. For more on that topic see “Dual Storage vs Dual Behavior“.

Ok, we’ve just gone down a deep rabbit hole. Maybe interesting, but is this important to reducing the overall memory footprint of your app? Generally no, sometimes yes. Let’s look at some examples.

Sometimes fields that are strictly numeric get inadvertently loaded as Dual() values. Certain operations including where clauses in loads can cause this behavior. Frankly, I don’t have comprehensive understanding of all the ways this can happen. But when it does happen, we can see numeric fields having a symbol size of more than 8.

The typical way to return these fields to 8 bytes (if you can’t fix the root cause of the issue) is to wrap the field with Num() or +0 when loading.

Num(UnitPrice) as UnitPrice
UnitPrice+0 as UnitPrice

I prefer neither approach. I typically use a TempFormat table instead.

Is it worth the trouble to fix these? At first glance it may look like a big deal, but the memory savings is typically small.

The UnitCost field occupies 40MB and the symbol width should be 8 instead of 13.45. Almost all of the storage is in the Index Bytes. The field has a relatively small amount of values. Making those 2,011 values 8 bytes each would save me a total of 10967 Symbol Bytes. (27055 – (2011 * 8))

All that said there are occasions when you have a larger number of distinct values and this can make a significant difference. I almost always “fix” these fields without giving it too much thought as it’s easy to do with a tool like QSDA.

Reduce the number of rows

Reducing the number of rows that reference a field decreases the Index space, but not the Symbol space.

Wait! Are you suggesting I load less data? No, I’m talking about data model changes that will not change the business value.

A typical opportunity to reduces rows is when you have very sparse data on a large fact table. Consider an OrderDetail table that includes return information on each Order Line. Only 0.5% of Order Lines get returned, so we end up with a lot of Index space pointing to nothing. This is indicated by a low Information Density for the table field.
QSDA Table Fields

These four Return fields in the SalesOrderDetail table require 23.28MB.

By moving these fields to a new “Returns” table, linked by SalesOrderDetailID, the Return fields and the linking key now require 227KB — a savings of 23MB, a relatively significant amount.

I hope you found some useful tips in this post. If you want to learn more about how QSDA Pro can help you optimize your Qlik Apps, join me on Nov 19 for the Click Less, Qlik More – QSDA Pro webinar or reach out to us.

-Rob
Facebook
Twitter
LinkedIn
RedditShare
Performance, Productivity, Qlik Sense, QSDA, Tools
Reducing Qlik App Resources with QSDA
May 22, 2024 Leave a comment

Longish post today where I show off the power of QSDA Pro to reduce Qlik App resources, saving you money and creating a more responsive experience for your users.

As a follow on to my last post “Help! My Qlik Cloud Reload Exceeds Quota!” I’m going to dive deeper into the available QSDA features to reduce memory requirements of a Qlik App. As a bonus we’ll use QSDA to improve the performance of a chart.

There are many good reasons to optimize your Qlik Apps to a leaner size. Smaller apps tend to perform better and place less demand on your server resources. If you are a Qlik Cloud customer, or planning a move to Qlik Cloud, App memory size impacts your license tier — and therefore your direct monthly costs.

In this post our starting point is I that have identified the App “BikeShop Sales” as having a large (597 MB) footprint. I got this information from Qlik App Metadata Analyzer as shown below.
Qlik App Metadata Analyzer

I could also have identified this memory footprint in QSDA Pro when we select this App from the list.
QSDA Applist

Let’s see how QSDA Pro can help. I’ll launch a new Analysis and give it the Description “Baseline”.

When the analysis completes press “View” to see the results.
QSDA Analysis Summary page

In the Resources card I see that unused fields occupy 383 MB — almost 2/3 of the base data model! Unused fields are fields that are not used anywhere in the front end. They can be removed without impacting the contents of charts or the user experience.

I also see some other suggested savings in dropping unused tables (“All fields unused but keys — 439 KB”) and a 530 KB savings by AutoNumbering keys.

A fast and simple way to remove unused fields is to drop them at the end of the script with a “DROP Fields …” statement. AutoNumbering is also best done at the end of the script. Let’s implement the QSDA recommendations. Open the Qlik Data Load Editor for “BikeShop Sales” in another browser tab.

The QSDA Tools menu provides a handy Script Generator to generate recommended script statements. Select the script generator from the Tools menu.
QSDA Tools menu

In the Script Generator > AutoNumber tab select the top checkbox to select all recommended fields. Press the “Copy” button to copy the generated AutoNumber statement to your clipboard. Paste the statements at the end of your Qlik Script. Repeat for the Drop Fields and Drop Tables tabs. (I won’t use the Load Statement tab just yet).

Now that I have updated the script with the AutoNumber and Drop statements, Reload.
Reload with AutoNumber, Drop Fields, Drop Tables

Returning to the QSDA App Card, I can see that Base App Memory is now 213 MB. Quite the savings from 507 MB!
App card after reload

At this stage, I recommend running a new analysis to confirm that the script changes have not introduced any problems or new issues.

Note that Reload Peak Memory is unchanged, because we loaded the unused data before we dropped it. Reload memory has an impact on the performance of on-prem servers and for Qlik Cloud, reload memory is a direct cost.

Can we use less reload memory by not loading the unused fields and tables? It may be that a field is used the load script but is not used in the front end, so you have to examine your script to determine. This very clean script loads directly from QVDs so the answer is clear.

I’ll start by commenting (or removing) the tables we don’t need instead of dropping them at script end. To identify the unused tables I can refer to the previously generated script, the Flags, or return to the Script Generator tool in the Baseline analysis.

What about Tables with both used and unused fields? Can I easily load just the used fields and omit the unused fields? QSDA Script Generator to the rescue again. Open the Script Generator > Load Statement in the Baseline analysis and sort on the “Unused Bytes” column. Select the SalesOrderDetail table.

A Load statement fieldlist for [SalesOrderDetail] will be created with unused fields commented out. You can exclude the unused fields entirely by unchecking the “Include Unused Fields” box. I’ll start with just the SalesOrderDetail table for now. Note that the other tables with big Unused Fields savings, Notes and Customers, are already being excluded completely.

Before reloading, I’ll remove the AutoNumber and Drop statements I added earlier. Many of those drops are no longer valid as I am not loading the fields at all. Here is the updated load script.

Updated script to exclude unused fields

After reloading, I return to the QSDA App Card. Reload Mem is reduced from 693 MB to 268 MB! I’ll run another analysis to see where things stand.
I can address the remaining unused fields with DROP Fields or using the Load Statement method. I will add the AutoNumber statements back in as well. I hope the process is clear enough now so I won’t show these remaining steps in detail here.

Let’s turn our attention to another great value of QSDA — Performance improvement. The “Calc Time Distribution” chart plots the calculation time of each chart in the App. I see I have an outlier that takes about 4 seconds to calculate.

What is this chart and why is is taking to long to calculate? Flip over to the Viz page and sort by the Calc Time column. The viz in question is a Table named “Salesperson Scorecard” on sheet “Dashboard” and it takes 4.142 seconds to calculate. Expanding the row shows the chart Dimensions and Measures and also exposes the “Viz Deconstruction” icon
Viz Details

Clicking the Viz Deconstruct icon will calculate each chart Measure in turn and tell us what is taking so long to calc in this chart. We can see the total calc time is over four seconds and measures three and four take considerably longer than the first two. But why?

Let’s focus on this chart to get some insight into the cause and solution of the poor performance. Back on the Viz page, Right-click the Viz of interest and select “Filter to Selected”. This will filter our pages to only those objects — Dimensions, Expressions, etc — associated with this Viz.

Click over to the Expressions page and we’ll see that our long running expressions have flags. Flags are the advice system of QSDA, identifying errors, bad practices and performance issues. Our two second expression “Longest Deal” has a “Key Field used in Expression” flag.

Clicking the “i” icon next to the flag will open the Flag Details panel which contains a link to the help article for this flag.
In the help article we’re informed that using a key field in an expression can sometimes cause poor performance. The article goes on to advise using a non-key field instead, creating a new field if necessary. I’ll take this advice and create a new field in the SalesOrderHeader table:

Reload and change the chart Measure to use the new field.

  Max(Aggr(Sum(LineSales), SalesOrderRecord))

Run a new analysis to check the calc time of the chart (and check we didn’t impact anything else!). In the summary we’ll see a significant decrease in total app calc time and we can drill into our chart to see what’s changed.

Whoa! That measure has gone from 2 seconds to 0.008 seconds.

But Rob, didn’t I just blow up my RAM by making a copy of this big field? Don’t guess, use QSDA to see exactly what the cost is.
Additional RAM of SalesOrderRecord field

The cost is 50 KB of RAM and no significant increase in Reload Mem. Was it worth it? I think so.

If you chose to put the new field on the SalesOrderDetail table instead of SalesOrderHeader, the QSDA results will quickly show you that this was a bad idea. RAM is much increased and performance not so good.

QSDA Pro gives you the tools to:

    Reduce your App memory and compute requirements.
    Focused advice and insight for improving your App.
    Compare different solutions and measure the impact of change.
    Track your progress and document the impact of your work.

I hope this post makes it clear why I say that QSDA Pro is “the tool that every Qlik developer needs”.

Do you have questions about QSDA Pro or want to schedule a demo for your team? Reach out to us.

If you’re attending Qlik Connect in Orlando, stop by the Motio booth on the show floor. I’ll be there (guy in the hat) to answer your questions and show you even more features of QSDA Pro that can help you create leaner, cleaner and faster Qlik Apps.

-Rob
Facebook
Twitter
LinkedIn
RedditShare
Performance, Productivity, Qlik Sense, QSDA, Tools
Help! My Qlik Cloud Reload Exceeds Quota!
May 9, 2024 Leave a comment

If you are a Qlik Cloud (SaaS) customer you may have seen this dreaded message during script reload. Ack! Ack!

Your quota may be different than 25Mb, but the problem remains the same. How do I modify this application to fit within my subscribed quota?

QSDA Pro V3.1 to the the rescue! QSDA analyzes your app and provides recommendations and easy to use tooling to drop unused data and optimize the remaining data, potentially greatly reducing the size of your Qlik App.

QSDA needs a successfully loaded app for analysis, so our first step is to reload the app using the “Limited load” feature of the Qlik script debugger.

Click the Debug button in the Qlik script editor, check the Limited load option, accept the default of 100 rows and click “Run” to initiate the reload. The reload will come in under your quota. When the reload completes, key Ctrl-s to persist the data.

You don’t have a business-ready app, but this is enough for QSDA to scan all charts, expressions and master items to determine what data is actually required.

In QSDA Pro we now select our Cloud connection and select the app of interest, in this case “BikeShop Sales2”. Click the “Open” button to prepare the app for analysis. I will also uncheck the “Collect Calctime” option because chart calculation times are not meaningful with our limited data. Description is optional, in this case I’ve entered “Limited Load”.

Click the “New Analysis” button to launch the QSDA Pro analysis. The analysis may take a minute or two to complete depending on the capacity of your tenant and the current Qlik Cloud load. When the analysis is complete press the “View” button to see the results.
In the Summary view we see there are 89 unused fields. Unused fields are fields that are not used in any charts, master items or expressions. These are fields that can be dropped at the end of script without impacting the user experience in the app. The actual storage numbers (KiB) are not meaningful because we only loaded 100 rows. The bar chart is useful in that is indicates about 2/3 of our data is unused. Hope!

QSDA provides a Script Generator in the Tools menu to generate a “DROP Fields …” script statement for unused fields. Select the script generator from the Tools menu.

In the Script Generator > Drop Fields tab select the top checkbox to select all recommended fields. Press the “Copy” button to copy the generated Drop Fields statement to your clipboard.

Paste the Drop Fields statement at the end of your Qlik Script and reload.

Reload successful! Victory!

A subsequent QSDA analysis shows the app size has been reduced from the problematic 37Mb to 15MB!

QSDA Pro can quickly and efficiently get your Qlik Apps below your Qlik Cloud quota by pruning unnecessary data. Don’t pay for more than you need.

In a follow up post I’ll walk through some additional QSDA features to help you reduce Qlik app footprint even further and improve chart response time to boot.

Download QSDA Pro and try it for yourself. Or reach out to us to learn more about license options or arrange a demo or POC for your team.

-Rob

Are you going to Qlik Connect? I’ll be at the Motio booth on the show floor ready to demo QSDA Pro or answer any questions you may have. Or just to say Hej 🙂
Facebook
Twitter
LinkedIn
RedditShare
Performance, Qlik Sense, QlikView, QSDA
Mind the Concat() sort-weight
Jan 24, 2023 1 Comment

Summary: While looking into long expressions I noticed that the optional sort-weight argument has an impact on the distinctness of Concat(distinct…). Incorrect use of sort-weight can generate bloated expressions containing redundant code.

In my work tuning Qlik Apps I sometimes encounter very long expressions. An expression many thousands of characters long can be difficult to debug or comprehend the expression goal. To help in working with long expressions I’ve added an Expression histogram and an Expression Decoder feature to my QSDA Pro product. (These features are currently in beta, generally available in early Feb).

I’ve noted expressions of length greater than 50k across apps from different customers. What did these expressions have in common that made them so large?

    They used the Concat() function in $() to dynamically generate a part of the expression.
    They used the optional sort-weight argument of Concat() incorrectly.
    They were much bigger than necessary — sometimes 100x — but the expanded expression worked as intended.

In the process of reviewing the expressions I learned something surprising. As a reminder here’s the syntax of the Concat function:

Concat({[SetExpression] [DISTINCT] [TOTAL []]} string[, delimiter[, sort_weight]])

We use the DISTINCT keyword to return the unique set of values from the string argument (usually a field). The Qlik documentation for DISTINCT says:

    If the word DISTINCT occurs before the function arguments, duplicates resulting from the evaluation of the function arguments are disregarded.
    https://help.qlik.com/en-US/sense/November2022/Subsystems/Hub/Content/Sense_Hub/ChartFunctions/StringAggregationFunctions/concat.htm

This means that the set of distinct values is the combinations of string and sort_weight (if used). Let me demonstrate with an example. Here’s a sample data table.

For the expression: Concat(Dim, ',') we receive output "a,b,c,c,c“.

Adding the DISTINCT keyword: Concat(DISTINCT Dim, ',') we now get “a,b,c“.

Adding a non-distinct sort-weight argument: Concat(DISTINCT Dim, ',', RecId) we now get "a,b,c,c,c” again. More output than I expected. It’s a distinct list of the combinations of Dim and RecId.

Adding a distinct sort-weight argument: Concat(DISTINCT Dim, ',', Weight) we now get "a,b,c“.

How about if we used an unlinked data island field for sort-weight? The Island field has two values.

Concat(DISTINCT Dim, ',', IslandField) returns "a,b,c,a,b,c“. Item count is the product of Dim * IslandField values. Remember this for later.

Ok, this is all very interesting but the behavior is super obvious and I would notice it if it came up in my App. What’s this got to do with ginormous expressions?

Developers sometimes use Concat along with Dollar Sign Expansion (DSE) to generate dynamic expression fragments. For example to ignore all fields from several tables in a set modifier:

Sum ({<
$(='[' & concat({<$Table={'Table1', 'Table2', 'Table3'}>}$Field,']=,[') & ']=')
>} Value)

Sometimes $(=Concat(...)) is used to build the list inside a Pick() or Match(). These type of expressions frequently have awkward syntax including lots of “& chr(39) &” type stuff. Inevitably the expression gets built by copying and modifying an expression from elsewhere in the App. An expression that contains a sort-weight. A sort-weight that doesn’t get removed. It may be an island field or a field that has a many to one relationship. The result is an expanded expression that works but is larger than it needs to be. No one notices (unless they use QSDA Pro) because it’s the expanded expression.

As a simple example, suppose the “ignore filter” expression above was supposed to generate something like "Quarter=,Month=,Year=“. If I inadvertently use a sort-weight field that has 100 distinct values the result will be repeated 100 times. The expression would still work but it would be 100x larger than necessary.

I recently found an example where Concat was used to generate an If() function from data (very clever) that should have had 15 branches. But an unrelated sort-weight field of 95 values resulted in 1425 branches! It “worked” but did a lot of unnecessary calculation.

If you are a solo developer or working in a small team you may never encounter this issue. But if you are a consultant or maintaining legacy Apps you may stumble across it. I’ve been playing with ways to flag this condition in QSDA Pro. QSDA already flags data island expressions . I’m testing creating a new flag specifically for Concat().

My colleague Oleg Troyansky uses QSDA in his Performance Tuning session at the Masters Summit for Qlik. Live events will return in Fall 2023 but in meantime you can attend individual workshops on-line during February through April. More information and schedule here.

Happy Qliking
-Rob

Facebook
Twitter
LinkedIn
RedditShare
Performance, Qlik Sense
Expression as Left Side of Set Modifier
Mar 24, 2022 14 Comments

Can I use an expression as the “fieldname” in a Set Modifier? In “<x={y}>” can “x” be an expression?

I always believed the answer to be “No”, x may only be a field name. That understanding is reinforced by what I read in the help doc for “set modifier”.

Yesterday I was surprised to discover that in Qlik Sense, this is a valid expression that returns sales for year 2015.

sum({<"=Year(OrderDate)"={2015}>}Sales)

This also works:

sum({<"=left(Country)"={'M'}>}Sales)

This is all news to me. And very interesting.

I stumbled across this accidentally when using the Expression Editor > Set Analysis > Insert button. I had selections in the derived field OrderDate.autocalendar.Year field. The set generated by the Insert tool was:

{<"=Dual(Year([OrderDate]),YearStart([OrderDate]))"={'2014','2015'}>}

That expression is the derived field definition that was specified in the script.

I have not yet formulated an opinion as to whether this is useful, or if there are any cautions or limitations when using. I’m at the curious stage at this point and will look into it more as well as read comments I am sure will follow.

-Rob
Facebook
Twitter
LinkedIn
RedditShare
Performance, Qlik Sense, QlikView, Scripting
How to Segment QVD Files
Mar 8, 2022 3 Comments

Summary: In this post I discuss when you may want to segment or “shard” QVD files and demonstrate some script patterns for producing and consuming segmented QVDs.

I recently received a question from a colleague who knew that I had done a lot of work with Qlik QVD files. He asked, “what’s the optimal size for a QVD file?”

My response was that in my experience there is no optimal physical size, but in many cases there are reasons to break a large QVD into multiple, smaller files. Dividing a large file into smaller files is called “segmenting” or “sharding”.

People generally start to think about segmenting QVDs when they encounter resource constraints while updating a QVD with an incremental load. In an incremental load, only new or changed rows are extracted from the database and merged with an existing QVD. This involves reading and writing the entire large QVD which can use significant time and I/O resources. This also means that the process takes increasingly longer as time marches on. Not pleasant.

Other reasons you may want to segment are consumption and archival patterns. It’s common to use the “latest n periods” of data in your active dashboard, for example the current 12 months. If the data is in a single large QVD, you have to roll off (delete) data older than 12 months. You can filter as you load, but that becomes an increasingly wasteful activity over time.

It’s likely that you will want to retain the older data for use in special projects or historical dashboards.

Given the example scenario above, it would make sense to create one QVD for each month. This will provide predictable performance for incremental updates as well as the dashboard load. Older data could be kept forever and any set of months could be accessed efficiently.

How do we do perform this magic segmentation? Let’s assume an example QVD with these fields:

TransactionID: Primary key
TransactionDate: Original date of transaction
LastUpdate: Timestamp of last update to this row. Transactions may receive updates up to 60 days after creation.
other…: other fields such as Amount, Customer, etc

We want to create one QVD per month using the name “Transactions-YYYY-MM.qvd”. What determines which QVD a transaction is placed in? Is it the MonthStart(TransactionDate)? It depends…

The simplest technique is for the extract script to place everything loaded today into the current month QVD, regardless of the TransactionDate. The QVD name is assigned to a variable in the script using:

Let vQvdName = 'Transactions-' & Date(Today(1),'YYYY-MM') & '.qvd';

When later loading 12 QVDs into the dashboard, load front (most current QVD) to back with the clause:

Where not Exists(TransactionID)

The Where clause will ensure that only the most current row for that TransactionID will be loaded.

This simple technique might be ok for most scenarios. But it’s not very robust because it falls down when you want to do something like a full reload to add columns, or data is loaded off schedule. It also would require that if want to load something like 6 months from the middle, we have to be careful to include enough later QVDs to cover possible updates.

A more robust approach would be to store each transaction row in the QVD corresponding with it’s TransactionDate. Here is one script pattern to do just that. Our starting point for this script is that we have already extracted the new and changed rows to create table “Transactions”.

Step #1 is to collect the month values into a temp table:

TempMonths:
LOAD Distinct
MonthStart(TransactionDate) as TranMonth
Resident Transactions; 

Next we process each TranMonth value in a loop block. The block will build a temp table of rows for just one month and merge with any existing QVD.

For i = 1 to FieldValueCount('TranMonth')
Let vMonthName = Date(FieldValue('TranMonth', $(i)), 'YYYY-MM');
Set vQvdName = Transactions-$(vMonthName).qvd;

MonthTransactions:
NoConcatenate LOAD * Resident Transactions
Where MonthStart(TransactionDate) = FieldValue('TranMonth', $(i));

If FileSize('$(vQvdName)') > 0 THEN // If we have existing QVD
LOAD * From [$(vQvdName)] (qvd)
Where Not Exists(TransactionID);
ENDIF

Store MonthTransactions into [$(vQvdName)] (qvd);
Drop Table MonthTransactions;
Next i

Drop Table TempMonths, Transactions; 

The above segmenting script would support incremental reload, full reload or a load of any data in between.

So now we have many “Transactions-YYYY-MM.qvd” files. How do we load the current 12 months? Do we wake up early on the 1st of each month and quick change the script? No. We create a dynamic script based off the current day.

For i = 0 to -11 step -1  // 12 Months
Let vMonthName = Date(AddMonths(Today(1), $(i)), 'YYYY-MM');
Transactions:
LOAD *
From [Transactions-$(vMonthName).qvd] (qvd);
Next i 

If we had built the QVDs using any technique that allowed for the possibility of duplicate TransactionID, we would add a guard of “Where not Exists()”.

...
From [Transactions-$(vMonthName).qvd] (qvd)
Where not Exists(TransactionID); 
What About IntraDay High Volume Reloads?

In scenarios with Intraday loading and high transaction counts, I prefer to defer merging QVDs to off-peak times.

Let’s take an example scenario of a customer who generates approximately 10 million transactions per day, with peak hours creating about 2 million transactions. The main dashboard should be refreshed hourly for twelve hours each day and should contain the last 10 days of transactions. Of course all data should be kept around for various summary analyses and ad-hoc projects.

It makes sense to segment these QVDs by day. Our hourly incremental load will need to merge with — read and write — a fairly large daily QVD. Crucially, the load time gets longer as the day progresses and the QVD gets larger. And now I hear rumors of twice hourly reload. This pattern has a bad smell.

What to do? Let’s store the hourly incremental rows in a hourly QVD of their own. The dashboard will then pick up all hourly QVDs plus required daily QVDs. Overnight, when we have some breathing room, we will run a script to consolidate the hourlies into a daily QVD.

The hourly incremental QVD is created like:

Let vQvdName = 'Hourly-Transactions-' & Timestamp(Now(1), 'YYYY-MM-DD-hh-mm-ss') & '.qvd'; 
Store Transactions into [$(vQvdName)] (qvd); 

Then the dashboard will load the new data using a wildcard load for the Hourly QVDs and a loop for the prior days:

// Load all Hourly QVDs
Load * From [Hourly-Transactions-*.qvd] (qvd);
// Load previous 9 days of Daily QVDs
For i = 1 to 9 // 9 Days
Let vDateName = Date((Today(1) -$(i)), 'YYYY-MM-DD');
Transactions:
LOAD * From [Transactions-$(vDateName).qvd] (qvd);
Next i 

Getting LastUpdate From a QVD

One of the steps in incremental loading is determining what “zzz” value to use in the SQL “Where LastUpdate >= zzz”. We need the high value from the last load. Some people store this information in a side file or variable. I think the most reliable approach is to get the high value from the existing QVD.

Getting Max(LastUpdate) from a very large QVD can take some time (how to do this the quickest is always an interesting pub question). My preferred technique is to store a new field “MaxLastUpdate” in the QVD and then read only the first row of the QVD to retrieve the value.

Getting and Joining Max(LastUpdate) should be fairly quick because we are only dealing with the incremental rows.

Transactions:
SQL Select * From db.transactions where LastUpdate >= foo;
Left Join (Transactions)
Load Max(LastUpdate) as MaxLastUpdate
Resident Transactions; 

The lastest MaxLastUpdate value can then be retrieved by reading only the first row of the existing QVD. Here’s how it looks all together using the example of monthly QVDs.

Let vMonthName = Date(Today(1), 'YYYY-MM');
TempMonth:
First 1 Load MaxLastUpdate
From [Transactions-$(vMonthName).qvd] (qvd);
Let vMaxLastUpdate = TimeStamp(Peek('MaxLastUpdate'), 'MM-DD-YYYY hh:mm:ss');
Drop Table TempMonth;

Transactions:
SQL Select * From db.transactiions
where LastUpdate >= '$(vMaxLastUpdate)'; 

Left Join (Transactions)
Load Max(LastUpdate) as MaxLastUpdate
Resident Transactions; 

// Merge or segment with existing QVDs

I hope you found some useful tips in this article. No doubt you have some ideas of your own, feel free to add comments.

Want to learn more advanced scripting techniques? After 2 years of virtual sessions, the Masters Summit for Qlik is back with live events this fall. In September we’ll be in Madrid, Spain, and in November we’ll be in New Orleans, USA. If you want to take your Qlik skills to the next level, get access to all sorts of ready-to-use solutions and reference materials, share experiences and maybe a few horror stories with your peers then we hope to see you there!
Facebook
Twitter
LinkedIn
RedditShare
Performance, Productivity, Qlik Sense, QlikView
If() Tips
Aug 24, 2021 5 Comments

Summary:  I offer some tips for writing better performing and easier to maintain syntax when using the Qlik If() function. 

The Qlik If() function is very powerful and  frequently appears in Qlik Sense and QlikView apps.

Expressions using multiple If() functions can easily get out of hand and become difficult to maintain or debug, as well as poor performers.

In this post I’ll offer some advice on avoiding If() pitfalls and tips to write easier to understand expressions.

The Qlik syntax diagram for the If function is:

if(condition , then [, else])

That’s perfectly clear to most people, but I prefer to think of it more like:

if(condition , true result [, false result])

Tip#1: If() does not short circuit.

Both the true & false branches are calculated even when only one is possibly true.  For example:

If(Only(Currency = 'LC',  Sum(Sales), Sum ([Sales LC])

In this case both Sum() expressions will be calculated even though only one value will be utilized.  In most cases this behavior is not of concern and in many applications will perform very well.   However, a nested If() with many possible branches or a large data set may perform poorly.

For more on the short circuit issue see “How to Choose an Expression“.

 

Tip#2: Use indentation sparingly.

The true or false result may be an additional, “nested” If(), which is where we start to see some ugly syntax.  Following traditional programming conventions many people automatically indent the nested if like this:

If(Sum(Sales) > 100000, 'Large',
    If(Sum(Sales) > 75000, 'Med', 
      If(Sum(Sales) > 50000, 'Demi',  'Small')
    )
)

Essentially,  the expression above classifies into one of four values.  I don’t think indentation  adds to the readability and indentation will lead you into “tab hell” when you get many possibilities.  I prefer to write this expression as:

If(Sum(Sales) > 100000, 'Large'
,If(Sum(Sales) > 75000, 'Med' 
,If(Sum(Sales) > 50000, 'Demi'
,'Small'
)))

No indentation, all the closing right parens collected on one line at the end. Makes it very easy in the expression editor to see that you have the right number of parens.

The leading (vs trailing) commas are my personal preference.  This make it easier to comment out logic and in my view, the comma belongs to the If that follows it, not the preceding If.

I think the above syntax makes it very easy to understand that I am choosing  one of four results, and what the rule is for each result.  Syntactically each If() is the else parameter of the preceding If().  I don’t think of the Ifs as “combined”, rather as “sequential”.

Do indent when you are using If() as the then parameter,  as shown in Tip#4 below.

 

Tip#3: Simplify by testing from high to low. 

The business rule that created this sample expression may have been stated to the Qlik developer like this:

“Classify sales of 0 to 50 000 as “Small”, 50 001 to 75 000 as “Demi”, 75 001 to 100 000 as “Med” and above 100 000 as “Large”.

The developer may faithfully translate the requirement into this expression.

If(Sum(Sales) > 0 and sum(Sales) <= 50000, 'Small'
,If(Sum(Sales) > 50000 and Sum(Sales) <= 75000, 'Demi', 
,If(Sum(Sales) > 75000 and <= 100000, 'Med'
,'Large'
)))

This returns the correct result. Testing from low to high values forces the use of “and” which makes the expression more complex than necessary and potentially slower to execute.  In my experience, testing from high to low, as in the Tip#2 example, yields a cleaner syntax.

 

Tip#4: Use “and” when you mean and.

Here’s a sample expression requirement:

When Sales > 1000 and Region=’US’, it’s “Mega US”. When Sales > 750 and Region = ‘UK’, it’s “Mega UK”. Otherwise it’s “General”.

I have seen this written as:

If(Sum(Sales) > 1000, 
    If(Region = 'US', 'Mega US'),
If(Sum(Sales) > 750, 
    If(Region = 'UK', 'Mega UK'), 
'General')

While the “and” requirement may be satisfied with a then-if  nesting, I find it clearer with the “and” keyword.

If(Sum(Sales) > 1000 and Region = 'US', 'Mega US'
,If(Sum(Sales) > 750 and Region = 'UK', 'Mega UK' 
,'General'
))

What if the requirement for  both US & UK were 1000?  You could argue that this is clear case for nesting in that there is a shared  condition and perhaps it would be a good practice to not repeat ourselves on the Sum(Sales).

If(Sum(Sales) > 1000, 
    If(Region = 'US', 'Mega US',
    If(Region = 'UK', 'Mega UK'), 'General'), 
'General')

Notice  we needed to repeat the ‘General’ result to cover the null case.  So it’s not super clean, but it may be worth it to not repeat the sum(Sales) calculation.  Generally I find the performance difference between “and” and “nested if” to be insignificant and tend to favor whatever is the clearer syntax for the given requirement.

What about Pick(Match())? 

I’ve heard it occasionally claimed that a Pick/Match combination will run faster than a nested If.   The expression might look like this:

Pick(
    Match(
      -1
      ,Region= 'US' and Sum(Sales) > 1000
      ,Region= 'UK' and Sum(Sales) > 1000
      , -1
    )
,'Mega US', 'Mega UK','General')

In my own testing and reading I’ve never found any performance advantage to Pick/Match.  That said, sometimes the syntax is appealing.

One thing I don’t like about Pick/Match is the distance between the condition list  and the result list. It’s fairly easy to get the lists  mis-aligned as the expression grows.

I  wish Qlik had a Switch type function like:

Switch (
  condition1 : result1
  [,condition2 : result2, ...]  
  [: defaultResult]
)

 

Tip#5: Simplify by using Column(n) or Measure Name

If your if() refers to something that has already been calculated in the chart, you can use the Column(n) function to refer to the value of a measure/expression column. For example, in a color expression:

If(Column(2) > 0, Green(), Red())

This can be much neater than repeating the expression text and typically runs faster as well.

If you are on Qlik Sense May 2021 you can use Master Measure names in the expression like:

If([Total Sales] > 0, Green(), Red())

[Total Sales] need not be a measure in this chart.

Both QlikView and Qlik Sense also allow you to reference the Label of a measure/expression column in the chart. In most versions the syntax checker will declare this an error even though it calculates correctly. I tend to avoid the label technique due to this confusion.

 

Tip#6: Don’t use If() as a chart filter

Use If when you want to dynamically select from two or more alternatives.  If should not be used simply to filter data like this:

Sum(If(Region = 'EU' and CYTDFlag = 1, Sales)

Filtering is best done with Set Analysis. The same expression written with a Set:

Sum({<Region={'EU'}, CYTDFlag={1}>} Sales)

Set Analysis is much faster than If.  If you are new to Set Analysis, you might initially find the syntax more challenging than If.  But SA  is much more powerful than If and well worth mastering.

 

Tip#7:  Consider the other conditional functions. 

Alt() and Coalesce() can be a more compact and elegant approach to testing for nulls. Instead of:

If(IsNull(SalesRep), Manager, SalesRep)

use:

Coalesce(SalesRep, Manager)
// If you want to consider empty and 
// blank strings as Null:
Coalesce(EmptyIsNull(Trim(SalesRep)), Manager)

When testing against a list of values,  instead of multiple If() or “or”, use the Match() or WildMatch() functions instead.

If (Match(StateCode, 'VA', 'TN', 'FL', 'GA'), 'South',  'Other')

 

I hope you find these tips useful.  You can use my QSDA Pro tool to quickly filter and examine all the uses of the If() function in a Qlik Sense App, located on-prem or in SaaS.

-Rob

 
Facebook
Twitter
LinkedIn
RedditShare
Performance, Qlik Sense, Tools
CubeTester
Jul 21, 2020 10 Comments

When working on Qlik Sense performance issues I frequently find I want to measure the performance of specific expressions. I might want to know how variations of an expression may perform against each other.  In a slow chart with many measures I want calculation time individually for each measure to focus my efforts.  Or perhaps I’m just satisfying a general curiosity or trying to settle a bet.

You can measure the performance of expression variations by modifying the chart and measuring the overall chart response time with something like Chrome Add Sense or QS Document Analyzer.  That approach can get kind of clunky especially when you are focused on a subset of measures in the chart.

I prefer a more structured approach to testing expressions. The tool I reach for is CubeTester.

CubeTester is an open source Nodejs command line tool for testing the performance of Qlik HyperCubes (Dimensions and Measures).  The test specification is written in a json file as either a HyperCubeDef or the “simplified” Dimension/Measure syntax.

Here’s a sample test written in simplified syntax that tests three variations of a cube (chart) containing one Dimension and three Measures.

I’ll run  CubeTester specifying the file that holds this test:

node index.js test tests/columns.json

And receive this output:

There is no significant difference in performance between the variations. Importantly, I can also see that all three return identical  total values as well.

CubeTester supports two commands:

    test : Run tests.
    extract: Extract app charts into a test file.

There are a number of options that can be specified on the command line or in the test definition. See the readme for more information on available options.

in addition to testing variations or trying out a theory, here are some other cases where I’ve used CubeTester.

    When working with a mashup where my HyperCube exists only in code, there is no chart to test.
    In a slow rendering chart I can test individual measures, combinations of measures and non-data expressions (like color expressions) to find the culprit.

Using CubeTester I can quickly try out ideas and document my progress as I work through an issue. I’ve made some interesting discoveries!

Some notes:

    Testing against a server uses certificates for authentication.  (Pull request welcome if you want more auth options).
    Make sure you specify “wss” when using a server endpoint eg
    wss://your.server:4747
    You’ll need to test with enough data to get calculation times of sufficient magnitude.  Two results of 5 milliseconds vs 7 milliseconds are not precise enough to draw conclusions from.
    Calculation time is affected by the capacity of the target machine and what else is running.  I recommend to repeat tests until you see a stable pattern.  Use the –repeat option and take the lowest result from each repeat.

CubeTester is free to use. Have fun!

-Rob

 
Facebook
Twitter
LinkedIn
RedditShare
Performance, Productivity, Qlik Sense, QlikView, Scripting
Creating Temporary Script Associations
Mar 4, 2020 8 Comments

Summary: I review using Join, Lookup() and ApplyMap() as script techniques  to calculate using fields from multiple tables. I ultimately recommend ApplyMap().

Qlik charts  can calculate values on the fly, using fields from multiple tables in the model.  The associative model takes care of navigating (joining) the correct fields together.  Our expression syntax doesn’t  identify what table a field exists in — the associative logic takes care of this detail for us.

We may want to calculate a measure, for example, “Net Amount”, applying a business rule requiring fields from several tables:

Our expression to calculate “Net Amount” might look like this:

Sum(Amount) - 
RangeSum(
  Sum(Quantity * UnitCost), 
  Sum(Amount * Discount), 
  Sum(Amount * SalesTaxRate), 
  Sum(Amount * ExciseTaxRate)
)

There may be cases (such as performance) where we want to pre-calculate “Net Amount” as a new field in the script.  In script, we don’t have the magic associative logic to assemble the fields.  When a script expression is used to create a new field, all fields must be available  in a single load statement.  This is straightforward when all the required fields are in the same table.  But what do we do when the fields come from multiple tables?

Here are three approaches to solving the problem of calculating a new field using multiple tables in script.

    Join
    Lookup() function
    ApplyMap() function

I’ll demonstrate deriving the same “Net Amount” calculation in the script.

JOIN

The Join option will require us to execute multiple joins to assemble the fields onto each Orders row and then finally do the calculation.  The script might look like this:

Left Join (Orders)
LOAD
 ProductId,
 UnitCost
Resident Products
; 
Left Join (Orders)
LOAD
 CustomerId,
 Discount,
 State
Resident Customers
; 
Left Join (Orders)
LOAD
 State,
 SalesTaxRate,
 ExciseTaxRate
Resident States
;

NetAmount:
LOAD
 OrderId,
 Amount - RangeSum(
   Quantity * UnitCost,
   Amount * Discount,
   Amount * SalesTaxRate,
   Amount * ExciseTaxRate
 ) as NetAmount
Resident Orders
;
// Drop the extra fields from Orders.
Drop Fields State, UnitCost, Discount, SalesTaxRate,ExciseTaxRate
From Orders
;

It’s a fairly good option.  It can be a lot of code depending on how many fields and tables we need to traverse. We need to be aware of “how many hops” between tables and may require intermediate joins (State field) to get to the final field (SalesTaxRate & ExciseTaxRate).

When using Join we need to ensure we have no duplicate keys that would mistakenly generate additional rows.

LOOKUP

Lookup() seems the most natural to me. It’s the least amount of code and it even sounds right: “look-up”.  It’s a one-to-one operation so there is no danger of generating extra rows.

It’s my least used option due to performance as we shall see.

Lookup takes four parameters  – a field to return, the field to test for a match, a match value to search for and the table to search.  Using Lookup() our script will look like this:

NetAmount:
LOAD
 OrderId,
 Amount - RangeSum(
   Quantity * Lookup('UnitCost', 'ProductId', ProductId, 'Products'),
   Amount * Lookup('Discount', 'CustomerId', CustomerId, 'Customers'),
   Amount * Lookup('SalesTaxRate', 'State', Lookup('State', 'CustomerId', CustomerId, 'Customers'), 'States'),
   Amount * Lookup('ExciseTaxRate', 'State', Lookup('State', 'CustomerId', CustomerId, 'Customers'), 'States')
 ) as NetAmount
Resident Orders
;

Note that for SalesTaxRate and ExciseTaxRate, the third parameter — the match value — is another Lookup() to retrieve the State. This is how we handle  multiple hops, by nesting Lookup().

It’s a nice clean statement that follows a simple pattern.  It performs adequately with small volumes of data.

Lookup does have a significant performance trap in that it uses a scan  to find a matching value.  How long to find a value is therefore dependent on where in the field the value is matched.  If it’s the first value it’s very quick, the 1000th value much longer, the 2000th value exactly twice as long as the 1000th. It’s a bit crazy making that it executes in O(n) time, for which I prefer the notation U(gh).

APPLYMAP

I like to think of the ApplyMap() approach as an optimized form of Lookup().  We first build mapping tables for each field we want to reference and then use ApplyMap() instead of Lookup() in the final statement. Our script will look like this:

Map_ProductId_UnitCost:
Mapping
Load ProductId, UnitCost
Resident Products
;
Map_CustomerId_Discount:
Mapping
Load CustomerId, Discount
Resident Customers
;
Map_CustomerId_State:
Mapping 
Load CustomerId, State
Resident Customers
;
Map_State_SalesTaxRate:
Mapping 
Load State, SalesTaxRate
Resident States
;
Map_State_ExciseTaxRate:
Mapping 
Load State, ExciseTaxRate
Resident States
;
NetAmount:
LOAD
 OrderId,
 Amount - RangeSum(
   Quantity * ApplyMap('Map_ProductId_UnitCost', ProductId, 0),
   Amount * ApplyMap('Map_CustomerId_Discount', CustomerId, 0),
   Amount * ApplyMap('Map_State_SalesTaxRate', ApplyMap('Map_CustomerId_State', CustomerId, 0)),
   Amount * ApplyMap('Map_State_ExciseTaxRate', ApplyMap('Map_CustomerId_State', CustomerId, 0))
 ) as NetAmount
Resident Orders
;

The mapping setup can be a lot of code depending on how many fields are involved. But it’s well structured and clean.

In the final statement, we are “looking up” the value using ApplyMap() and it performs very quickly.  ApplyMap uses a hashed lookup so it does not matter where in the list the value lies, all values perform equally.

We can re-structure and simplify the mapping setup and subsequent use with a subroutine like this:

Sub MapField(keyField, valueField, table)
// Create mapping table and set vValueField var // equal to ApplyMap() string.
 [Map_$(keyField)_$(valueField)]:
 Mapping Load [$(keyField)], [$(valueField)]
 Resident $(table);
 Set [v$(valueField)] = ApplyMap('Map_$(keyField)_$(valueField)', [$(keyField)]);
End Sub

Call MapField('ProductId', 'UnitCost', 'Products')
Call MapField('CustomerId', 'Discount', 'Customers')
Call MapField('CustomerId', 'State', 'Customers')
Call MapField('State', 'SalesTaxRate', 'States')
Call MapField('State', 'ExciseTaxRate', 'States')

NetAmount:
LOAD
 OrderId,
 Amount - RangeSum(
 Quantity * $(vUnitCost),
 Amount * $(vDiscount),
 Amount * $(vSalesTaxRate),
 Amount * $(vExciseTaxRate)
 ) as NetAmount
;
LOAD
 *,
 $(vState) as State
Resident Orders
;

Note the use of the preceding load to handle the nested lookup of State.   You could also modify the Sub to handle some level of nesting as well.

I typically use the mapping approach as I find it always gives accurate results (with Join you must be careful of duplicate keys) and generally performs the best, and importantly, consistently.

Whether you are new to Qlik or an old hand I hope you found something useful in reading this far.

-Rob

 Sep 19, 2018 8 Comments

Lately I’ve been digging into an old Qlik performance question.  How much impact, if any, does the order of Qlik data tables have on chart calc time?  My experience is that for a chart or aggr() cube with a lot of dimension values,  ordering of rows by dimension values can have a significant and measurable effect.

Mike Steedle of Axis Group blogged about the issue  a couple of years ago.  Mike’s post includes a useful subroutine to organize any table by a specific field.

I’ve added my own study and sample files on the topic in this QlikCommunity post.

Mike and I are are working together on the next update to Qlik Sense Document Analyzer.  Mike is keen on analyzing the data model and making useful recommendations.  One of the optimization questions we are studying is whether it is possible to make a solid recommendation on data table organization.

I’m curious to hear what others have discovered on the topic.  Do you have any rules you follow in ordering table rows?   Any thresholds or object/expression scenarios where you find it’s worth the trouble to manage the ordering?

-Rob

 
Facebook
Twitter
LinkedIn
RedditShare
Performance, Scripting
AutoNumber vs AutoNumberHash128
Apr 15, 2018 16 Comments

Summary:  AutoNumberHash128(A, B) runs about 30% faster than AutoNumber(A &’-‘ & B).

It’s a common practice to use the script AutoNumber() function to reduce the storage required for large compound keys in a Qlik data model. For example:

AutoNumber(A & '-' & B) as %KeyField

As a standard practice, we generally include a separator like ‘-‘ to ensure ‘1’ & ’11’ does not get confused with ’11’ & ‘1’.

The AutoNumber process can add significant run time to a script with many rows.

I’ve always wondered what the AutoNumberHash128() function was good for.

AutoNumberHash128(A,B) as %KeyField

This function first hashes A & B and then autonumbers the result. The end result is the same as the first example given using AutoNumber().  I find the AutoNumberHash128 syntax a bit simpler as a separator is not required.

What surprised me is that the AutoNumberHash128() function runs faster.  Typically about 30% faster than a plain AutoNumber with a concatenated string parameter.

Why is it faster?  The difference is in the function used to create the single value to be autonumbered.  Hash128 is considerably faster than string concatenation (&).

AutoNumberHash128() can take any number of fields, but it does not have an “AutoId” parameter.  The “AutoId” (second parameter) in AutoNumber() is recommended to ensure we get sequential integers when autonumbering more than one key field.  Sequential integers are the most memory efficient storage for keys.

Don’t despair.  AutoNumberHash128() will use the “default” AutoId.  That is fine if you are autonumbering only one key.  If you are doing more than one key, use AutoNumberHash128() for your largest — most rows — key and use AutoNumber() with AutoId for the rest.  You will improve the script run time of one key.

Another possible tradeoff when you have many large keys is to use AutoNumberHash128 for all keys and forgo the sequential integer optimization.  You will use only 8 bytes per key value which could be significantly less than the original string keys.

-Rob

Update 20 Sept 2022

Things have changed somewhat with the addition of the AutoNumber statement, which is the recommended method to autonumber keys. AutoId is no longer a problem.  In my recent testing  creating compound key fields, I still find that Hash128() is somewhat faster than the & operator.  Here’s the results. Option 4 is creating the key with the & operator and AutoNumber statement. Option 5 is creating the key with Hash128() and AutoNumber statement.

 
Facebook
Twitter
LinkedIn
RedditShare
Performance
Preceding Load Performance Update
Mar 27, 2018 17 Comments

Summary:  Preceding load used to slow down your script. but no more. Beginning with QV Nov 2017,  preceding load has no performance penalty.

I’ve posted several times about the elegance of preceding load.  I’ve also written about how preceding load can make your script run significantly slower.  Good news! Beginning with QV release Nov 2017 (12.20) the performance penalty has been eliminated.

To demonstrate  the improvement, let me start with  some test results from QV12.10 SR8,  prior to the improvement.

 

Test 0, the first bar, indicates the time in seconds to perform an optimized load of  a 20 million row QVD.  Test 1, which follows, is loading the same QVD but with the addition of two new calculated  fields in the same LOAD statement.  The calculations are trivial, so the increase in elapsed time is mostly due to the loss of the optimized load.

Test 2 creates the same calculated fields using preceding load and you can see the dramatic increase in elapsed time.  Test 5 adds a “LOAD *” to the preceding load stack and again shows a large increase in duration.

Tests 3, 4 & 6 repeat the same tests using Resident as the source instead of QVD.  Once again, a significant increase in duration when preceding is used.

I’ve been running this same test suite for several years across multiple QV releases, different machines and varying datasets.  The results are generally the same.

The problem, as explained to me by Henric Cronström and confirmed by my own observations, is that the preceding load code  uses only a single processing thread.  So while tests 1 & 3 above will use multiple threads, tests 2,4,5,6 will use only a single thread.   One way to think of this is not that preceding load runs slower, but that non-preceding load runs faster.

I never did understand why Preceding-Resident ran slower than Preceding-QVD, but I no longer care!

Here I add test results (in red) for QV Nov 2017 SR1 (Qv 12.20) .

You can see optimized QVD (test 0)  is about the same.  Adding calculated fields (test 1) is  slightly better between releases.

What is really significant is there is no longer any increase when using preceding load.  Further,  Resident performs faster than QVD as I would expect. (Note both tests used an SSD drive).

This is all great news as there are many cases where preceding load can help make your code more maintainable and understandable.  I hated to choose between clarity and performance.

What about Qlik Sense?   I’ve confirmed that Feb 2018 Desktop exhibits the new “no-penalty” performance.  I don’t know about previous releases.

No reason to fear preceding load!

-Rob
Facebook
Twitter
LinkedIn
RedditShare
Performance, QlikView, Tools
Document Analyzer Batch Analysis
Jul 18, 2017 15 Comments

I’ve received several requests to provide a batch interface to the popular QV Document Analyzer tool that will provide for analyzing multiple QVWs with a single command.  It’s now available in the QV Document Analyzer bundle available for download here.

The script is a windows cmd file.  The usage from the command line is:

DaBatch.cmd somedir

 where “somedir” is a directory of QVWs to be analyzed.   Each QVW in the directory will be processed by Document Analyzer and the results will be saved for later review.
Before running, there are a number of configuration variables in DABatch.cmd you will want to review and modify as necessary.

 

REM *** Path to QV.exe executable ***

SET qvDir=C:\Program Files\QlikView\Qv.exe

This is location of the QV Desktop executable. The provided value is the default location for most users and is typically appropriate as-is.

REM *** Path to DocumentAnalyzer.qvw. Note that v3.6 or later is required! ***

SET DaPath=DocumentAnalyzer_V3.6.qvw

Where is the Document Analyzer.qvw to be found?  Note that DA V3.6 or later is required by DABatch.

 

REM *** Directory to store DocumentAnalyzerResults QVDs and QVWs. Will be created if it doesn't exist *** SET DaResultsDir=C:\temp\MyDaResults

Specify the directory where analysis results will be saved.  If this directory does not exist, it will be created.

 

REM *** Should the analyzer results be stored in a QVD (YES/NO)? ***
SET SaveResultsInQVD=YES

Do you want to save the DA results in a QVD for later analysis by the DaCompareTool.qvw?  The default of “YES” is usually appropriate here.   QVD result files include a timestamp so you will always get new files for each run. Change to “NO” if you don’t want result QVDs.

 

REM *** Should the analyzer results be stored in a QVW (YES/NO)? ***

SET SaveResultsInQVW=YES

If “YES”, a DA QVW will be saved for each analysis and named “DocumentAnalyzer_your_qvwname.qvw”.  If a file exists with this name, it will be overwritten. If you don’t want individual DA QVWs, change this variable to “NO”.

 
After launching DABatch, you will receive one prompt:

Analysis Title? <ENTER> for 'Baseline'

The prompt is requesting a title to be assigned to the Result QVDs that will be consumed by DaCompareTool.  To accept the default of “Baseline”,  press <Enter>.  Otherwise type a new value and press <Enter>.

If you have set “SET SaveResultsInQVD=NO” as a configuration option, the title value is irrelevant.  (Perhaps I should not prompt in that case; next version?).

While the script is running Document Analyzer windows will be launched for each QVW and progress message displayed.  It’s best to keep your hands off the keyboard to get proper timings.  Good time to get that coffee.
When execution is complete you’ll see a summary message.

*****************************************************
Batch Analysis complete. 3 QVWs analyzed.
*****************************************************

 
You can now review each”DocumentAnalyzer_your_qvwname.qvw” file or load the result QVDs into DaCompareTool.qvw for comparative analysis.

 
Please let me know in the comments section if you can think of enhancements that support your use case for DA batch analysis.

 
-Rob
Facebook
Twitter
LinkedIn
RedditShare
Performance
Dual Storage vs Dual Behavior
Mar 13, 2017 6 Comments

Summary: The Dual() function stores both string and numeric representations of a value.  “Implied Duals”  such as Dates, store only the numeric portion and apply the string mask as needed. In some circumstances such as un-optimized QVD loads, implied duals can get converted to “full duals” using storage unnecessarily.

In QlikView and Qlik Sense you can create a Dual field using the Dual() function such as:

if(ShipDate = OrderDate, Dual('Yes',1), Dual('No', 0)) as SameDayShip

Dual fields have both string and numeric representations and Qlik is smart about using the correct representation based on context.

In a listbox or filter, SameDayShip will show the string values as:

Yes
 No

We can also write expressions such as:

Sum(SameDayShip)

which will smartly and automatically use the numeric value of SameDayShip.

Internally, the values will be stored in the symbol table like this:
Y 	e 	s 	1
N 	o 	0 	

The numeric portion, 1 or 0 in this case, will always occupy 8 bytes. The average symbol length will be 10.5 —  (11 + 10) / 2 values. You can display the symbol length by using a tool like Document Analyzer.

What about Date() or Num() fields, which are also Dual fields?  When properly scripted, these are what I call “Implied Dual fields”. They have dual behavior, but do not occupy the full dual storage.

Dates are represented as the number of days since Dec 31, 1899.  Today’s date (March 12, 2017) number is 42806.  A properly optimized date stores only the numeric value and does not store the  string value. Instead , the format mask is stored once as an attribute of the field.
Format: M/D/YYYY
ShipDate
42804
42802
42800

On demand, when the string representation is required (like in a listbox) the format mask is applied.  The symbol length in this case is always 8, only the numeric value.

Sometimes — such as in an un-optimized QVD load — the field is converted to what I call a “full dual” (like the “SameDayShip ” example) and both the string and numeric values are stored in the symbol table.  This can greatly increase the storage used for the symbol table.
3/10/2017 	42804
3/8/2017 	42802
3/6/2017 	42800

 

An example of an un-optimized load that will create the “full dual” representation:

LOAD
 DateField
 FROM Dates.qvd (qvd)
 Where Year(DateField) >= 2016;

In QlikView, you can “fix” this problem by going into the Document Properties, Number pane and changing the field format from “Mixed” to to “Date” format.  QV will immediately release the string storage.

Qlik Sense does not provide a Number Format pane, so you must apply corrections in the script like this:

LOAD
 Date(Num(DateField)) as DateField
 FROM Dates.qvd (qvd)
 Where Year(DateField) >= 2016;

To be fair, this is usually not a big deal for something like Dates, which have a relatively small number of values.  It can become more significant with something like Timestamps or other numeric fields that have many unique values.

The “Recommendations” sheet of Document Analyzer identifies these “Numeric Size” opportunities and quantifies the memory savings if you were to apply a correction.

-Rob

 

 

 
Facebook
Twitter
LinkedIn
RedditShare
Performance, Scripting
Q-On Courses in January
Dec 14, 2015 Leave a comment

Just a heads up to get in your planning before taking a holiday break.  I’ll be teaching two on-line courses in early January:

January 7  QlikView™ Document Performance Tuning

Learn how to measure and optimize the performance of your QlikView apps. By the end of the session, you will understand how the calculation process in QlikView works, and how data model, expression and chart design impact response times and resource usage.

You will come away with the skills to analyze your own apps and make them run faster.

 

January 6  QlikView™ Components Scripting Library

Speed up your QlikView™ development workflow by making use of the powerful QlikView Components (QVC) scripting library.

QVC can help you build your QlikView™ projects quicker and ensuring a high level of quality in your scripts. The set of ready-made subroutines that QVC provides can be used to perform common script operations, implemented in a flexible way and incorporating best practices.

 

Hope to see you there !

-Rob
Facebook
Twitter
LinkedIn
RedditShare
Performance
The Impact of Data Islands on Cache and CPU
Jun 10, 2015 18 Comments

Well that’s a wordy title isn’t it?

I’m in the midst of  writing a new QlikView Document  Optimization course to be delivered at  Q-On Training .  This work has reminded me of a not-so-obvious issue I sometimes see in  Performance Tuning engagements with customers.

You might be thinking I’m going to write today about how heavy a calculation can be as a result of the cartesian product of disconnected fields in an expression . No…that’s not what I’m thinking of.

What I’m thinking about today is the impacts of selecting  a field that is not used by any expression on the sheet. For example, a Currency listbox may be present on the sheet.  The Currency field is not connected (“Data Island”) to other tables in the model . Some, or none, of the objects on this sheet may reference that Currency field.

What happens when you click a Currency value? Everything on the sheet gets recalculated.  E v e ry t h i n g.  Whether it uses Currency or not. Why? Because the data has changed.

Since the data used in my chart has not changed, the results will be fetched from cache, right? Probably not.  Let’s look at an example:

Dimension:  Customer
Expression:  Sum(Sales)

The current selection in Currency  is “USD”.  The chart has been calculated and the results stored in cache, available for speedy retrieval if the same expression is calculated over the same set of data.

Select “EUR” in Currency. The cached result will not be used even though no change has been made in the data used by the chart. Cache evaluation considers the entire data model, not just data referenced by the object. If you now select “USD”, the previously cached result will be used.

If your application is large enough that you consider this behavior to be a problem, a leaner alternative for the Currency example is to use a variable. When a variable changes, only objects that reference the variable get recalculated. Another great alternative is to put the Currency listbox in a different Alternate State.

Let’s look at another case, the idea of a “universal listbox” that has been published by a several authors. I think it’s a very cool idea and I use it myself for data exploration. The common idea is that you let the user pick any field and then make selections in that field. This can be built using the system fields $Table and $Field.

Let’s consider the app is idle and all the sheet objects are occupying what I’ll term “relative cache slot #1” – the first cache entry for each object.  Now we’ll use the universal listbox.

1. Select a $Table value. Everything is recalculated, consuming CPU resources and the results are stored in “cache slot #2”.

2. Select a $Field value, “ProductGroup”.  Everything is recalculated, consuming CPU resources and the results are stored in “cache slot #3”.

3. Make some selections in  “ProductGroup”.  Everything is recalculated, consuming CPU resources and the results are stored in “cache slot #4”.  This result, with the new data, is what the user is interested in.

We have used three times the CPU and cache resources to achieve the end result.  A leaner alternative would be to place the universal listbox on it’s own sheet, thus avoiding extra recalculations.  You can move back and forth with buttons to make it feel like it’s integrated with each sheet.

I don’t mean to discourage the use of  these data island techniques. They can be incredibly useful to the #1 goal  — getting accurate  information to your business in a timely and cost efficient manner. However, when you are dealing a specific performance concern in larger apps this is an area you may want to examine and optimize.

-Rob

Watch the Q-On Training site or subscribe to our Q-On newsletter to be notified when the new Performance course is available. For more performance related discussions and tips, join me at the Masters Summit for QlikView Sept 23-25 NYC or 29 Sep-1 Oct Copenhagen. 

 
Facebook
Twitter
LinkedIn
RedditShare
Performance, Scripting
Better Calendar Scripts
May 28, 2015 62 Comments

TLDR: A new Qlik Sense training video uses a tired old-school Master Calendar script. I propose that updated training materials should use an updated script.

I just watched  a new  video by Michael Tarallo of Qlik titled “Understanding the Master Calendar – Qlik Sense and QlikView“.  Before I  pick on the contents of this particular video, I want to  credit  Michael for  producing many excellent training videos that are worth watching and learning from. I  highly recommend them.

The video does a great job of explaining the need for and function of a Master Calendar in your data model. It then goes on to show an actual script.

I can’t discuss Master Calendar without expressing disappointment that Calendar generation is not yet a builtin function in Sense. Something like QlikView Components (QVC) does with the single script line:

CALL Qvc.CalendarFromField('OrderDate');

On to the script used in this new video. I’ll reproduce the entire script below and then comment on the techniques used and suggest some more “modern” approaches.

The video script is  similar to the script used in the current QlikView Developer course . I acknowledge that this script works as is and produces correct results. But I don’t think it should be taught to newbies as good scripting. Here’s the script from the video:

Obsolete Code

1. Why is this field created  and where is it used?

It’s not used. It’s left over from a very old version of the exercise and it doesn’t serve any purpose.

2. Why are we sorting the table? Is this statement useful?

Even if I could think of a good reason why  the Calendar table should be in order, it already is in this order because the TempCalendar was generated in a loop. Statement unnecessary.

Inefficient Code

Loading a Resident table can be very slow for a large table.

 

Experienced scripters use the FieldValues array instead.

What’s the difference? FieldValues only reads the distinct values of a field — maybe a thousand or so for several years of dates. Resident reads every row of the table. For a 10M row fact table, that’s 10M reads and the time scales up linearly. The difference can be dramatic.

Error Prone and Extra Work

Peek(), used on lines 13 & 14,  is one of those functions that fails silently. That is, if you misspell a field or table,  you won’t get a script error. Misspelling a variable will also not generate  a script error. Maybe. Or maybe not. Or maybe you will get a Calendar that starts in year 1899.  Depends on which line you make the spelling error on. If your misspelling does result in a script syntax error, it will be downstream from where you created the problem. There are multiple ways to mess this one up and some very curious potential results.

Don’t forget to DROP those temp tables on lines 15 and 35.

And those varMinDate and varMaxDate variables really should be cleared as well.

You can avoid all the syntax traps and extra cleanup by coding this a as a Preceding Load.  Here’s the same script written as a Preceding Load:

Nothing to remember (or forget) to clean up.  If you misspell a fieldname, you will get an understandable error at the right place. This is the calendar script I wish we would provide to newcomers.

Of course if you’ve attended the Masters Summit for QlikView, you’ve learned all about FieldValues, Preceding Loads and more. If not, attend a summit this Fall in NYC or Copenhagen.

QVC users don’t even get out of bed to generate Calendars. But they know that all that best practice stuff is happening under the covers. If you want to learn more about QVC, join my online class June 4 or a future class at Q-on.bi.

-Rob

Entire script suitable for copying:

MasterCalendar: 
Load 
 TempDate AS OrderDate, 
 week(TempDate) As Week, 
 Year(TempDate) As Year, 
 Month(TempDate) As Month, 
 Day(TempDate) As Day, 
 'Q' & ceil(month(TempDate) / 3) AS Quarter, 
 Week(weekstart(TempDate)) & '-' & WeekYear(TempDate) as WeekYear, 
 WeekDay(TempDate) as WeekDay 
;

//=== Generate a temp table of dates === 
LOAD 
 date(mindate + IterNo()) AS TempDate
 ,maxdate // Used in InYearToDate() above, but not kept 
WHILE mindate + IterNo() <= maxdate;

//=== Get min/max dates from Field ===/
LOAD
 min(FieldValue('OrderDate', recno()))-1 as mindate,
 max(FieldValue('OrderDate', recno())) as maxdate
AUTOGENERATE FieldValueCount('OrderDate');

Facebook
Twitter
LinkedIn
RedditShare
Performance
Document Analyzer Numeric Field Recommendations
Apr 2, 2015 4 Comments

In the latest release 2.4  of QV Document Analyzer I’ve started the process of adding “Recommendations”, highlighting specific areas where potential improvement may be made to your document.

The recommendation included in this release is “Numeric field sizes”. Numeric fields that occupy more than 8 bytes of storage per value will be flagged. They will be highlighted on the Fields sheet and additional details will be provided on the Recommendation sheet.  The potential savings from “fixing” the field is also shown.

So what is this 8 byte thing? Ideally, most numeric fields (which includes timestamps) can be represented by 8 bytes of storage. In the Number format property or the script num() function you assign a formatting mask to be used for string representation.  QV stores the 8 byte number and applies the mask at display time.

Occasionally, particularly when doing an un-optimized load from QVD, the data can wind up being saved as “Mixed” which means both the numeric and string representations are stored for each value. So you may see Symbol widths of 17, 20, 24 or even greater for this field.

In larger apps with many unique numeric values, I’ve found significant memory savings by restoring these Mixed fields to a numeric format.

The usual tuning and optimizing caveat applies here. Don’t spend effort recovering a few megabytes. You have better things to do. But if you are wrestling with the megabeast app, fixing the biggest of those fields may be worth the effort.

-Rob
Facebook
Twitter
LinkedIn
RedditShare
Performance
How to Choose an Expression
Dec 19, 2014 8 Comments

This is a follow on to my post “How Not to Choose an Expression” that described the performance problem sometimes experienced in large apps when choosing one of several expressions.

I received a number of questions about the scalability of my suggested solution to define multiple Expressions using the Expression Conditional property. In this post I’ll present an alternative for when you have a large number of option combinations.

Before I dive in,  an important comment about coding for performance. First, you should code for clarity and maintainability. If your document contains only a few million rows, it probably won’t matter if you use if() or an alternative technique.  I’m fond of the  Donald Knuth quote “Premature optimization is the root of all evil (or at least most of it) in programming”. The techniques presented in this post are meant to solve an identifiable performance problem. I wouldn’t bother implementing them unless I have a need.

Let’s use a scenario where calculations should reflect user selected options.

    US Dollars or Local Currency  — USD | LC
    Include VAT?  — Y|N

I’m only dealing with two options to keep my example manageable. You should be able to extend the concepts into many options.

The if method chart Expression for our choice may look like this:

if(CurrencyType='USD' AND [Include VAT?]='N'
 ,Sum(SalesAmount_USD)
,if(CurrencyType='USD' AND [Include VAT?]='Y'
 ,Sum(SalesAmount_USD + VAT_USD)
,if(CurrencyType='LC' AND [Include VAT?]='N'
 ,Sum(SalesAmount_LC)
,if(CurrencyType='LC' AND [Include VAT?]='Y'
 ,Sum(SalesAmount_LC + VAT_LC)
))))

The [CurrencyType] field controls which field we will sum() and the [Include VAT?] field controls if the associated VAT field is included in the sum(). What’s the difference between the alternatives? Only the fields listed in the sum().

Our Document contains 100M rows and we’ve identified this expression as a bottleneck. What are some alternatives to make this perform better?

In my previous post, I discussed dividing this into four expressions and making a choice using the Expression Conditional property. I won’t repeat the details of it here.  In this case, I don’t want to create multiple expressions in the charts. What is another possible technique?

Start by loading a table that reflects the choice fields and the associated sum() fields.

This is an island table that is not linked to any other tables in our model.

Create Listboxes for [CurrencyType] and [Include VAT?]. Set the “Always One Selected” property in the Listboxes.  This will force the user to make selections and at any given time only one row will be possible in our table.

We will then reference the SalesExprField in our chart using Dollar Sign Expansion (DSE). DSE is performed before the expression is evaluated. Our chart expression is now:

Sum($(=SalesExprField))

The “=” within the DSE says to evaluate this as an expression. In other words, substitute in the value of the SalesExprField and then evaluate the Sum().

Do you want to see what DSE is actually substituting? In a Straight Table, clear the Label field. The substituted expression will be visible in the column heading.

If we are not sure that “Always On Selected” is guaranteed, we should use some type of aggregation function to ensure a single SalesExprField is selected. For example, to take the first possible value:

Sum($(=FirstSortedValue(DISTINCT SalesExprField,1)))

Instead of just parameters to  the sum() function, we could have included the entire expression in our island table,  eg “Sum(SalesAmount_LC + VAT_LC)”. In that case our chart expression would be:

$(=SalesExprField)

What if want to control options via variables instead of fields? Use a Set expression in the Only() function.

Sum(
$(=only({<CurrencyType={$(vCurrencyType)},[Include VAT?]={$(vIncludeVAT)}>}SalesExprField))
)

If you’ve read this far, you are probably wondering “Is there a downloadable example”. Yes, it can be found here. Qlikview Cookbook: How to Choose an Expression.

-Rob

Want more performance tips?  Come see Oleg Troyansky’s Performance Tuning session and  additional tips  from other presenters at the “Masters Summit for Qlikvew”.


Performance
How Not to Choose an Expression
Dec 15, 2014 14 Comments

We sometimes have a  requirement to select between two or more expressions  dependant on user selections or some other condition. For example, this chart Expression.

if(vWithCommission=1
 // Calculate with Commision
 ,sum({<CommissionFlag={1}>}
     SalesAmount - SalesAmount * CommissionRate)
 // Calculate without Commission
 ,sum(SalesAmount)
 )

The  if()  will select one or the other sum() expression based on the value of the vWithCommmision variable.  Because a variable is being tested —  not a row value — only one sum() will be chosen for the entire chart.

If performance is important,  this is not a good way to implement the requirement. QlikView does not “short circuit”. Short circuit means to stop evaluating when the condition is true. QlikView will calculate both sums and then return one of those results.

Some people mistakenly believe that putting the above expression in a variable changes the behavior. This is incorrect. The if() evaluation is still done at the chart level and the performance impact remains.

A performant way to solve the requirement is to put each calculation into a separate chart Expression and use the  Conditional property to select the Expression.

An Expression with  a Conditional evaluating to False will not be calculated or displayed.

There is also the possibility of choosing the calculation in a variable, but you have to follow a few rules.

    The variable should return the string representation of the formula. Note the single quotes in the example below.
    The variable definition should begin with “=”. This causes the if() to be evaluated only once.
    In the chart Expression, reference to the variable should be made with $(). eg  $(vChooseCalc)

=if(vWithCommission=1
    ,'sum({<CommissionFlag={1}>}
        SalesAmount - SalesAmount * CommissionRate)'
    ,'sum(SalesAmount)'
)

-Rob

For more performance tips, join us at the upcoming “Masters Summit for Qlikvew”  in San Francisco May 2015 where Oleg Troyansky presents an always enlightening session on Performance Tuning. Can’t make SF? Check out the other dates and locations on the website.

 
Facebook
Twitter
LinkedIn
RedditShare
Performance, Visualization
Performance Tip – Using Dual() and Chart Visual Cues
Apr 7, 2014 7 Comments

I recently diagnosed a slow Straight Table chart. The chart contained 100K+ rows. One column contained a complex expression that returned a Y/N string flag for the column. Something like:

=if(complex expression, ‘Y’, ‘N’)

They also wanted to set the background color of the cell, green for Y, red for N. So the Expression Background Color property repeated the same complex expression to assign a color:

=if(complex expression, green(), red())

I surmised the expression was being calculated twice for each row. I changed  the main expression to set a Dual().

=if(complex expression, dual(‘Y’,1), dual(‘N’,0))

The chart cell still displays the Y/N text. But now I could use 1 and 0 values on the Visual Cues pane and eliminate the Background Color expression entirely. Much faster!

-Rob
Facebook
Twitter
LinkedIn
RedditShare
Performance, Scripting
Speed up Script Development with BUFFER
Feb 3, 2014 8 Comments

A BUFFER prefix on a LOAD or SQL statement creates and maintains an automatic QVD for that statement. Subsequent executions of the LOAD/SELECT statement will read from the QVD, avoiding another (slower) trip to the database. A read from QVD is generally 5-10 times faster than fetching from database.

TranTab:
BUFFER LOAD 
TranID,
Amount,
CustomerID,
etc…
;
SQL SELECT * FROM TRANSACTIONS
;

On first execution, the SELECT will fetch rows from the database and the resulting TranTab will be stored in a specially named QVD on the local machine. On subsequent reloads, TranTab will automatically be loaded from the local QVD.

If you make a change to the TranTab LOAD/SQL statement, QV Reload will detect the change and fetch from the database again and update the local QVD.

During script development it’s not uncommon to perform a reload several times. You can greatly reduce the duration of a script run by adding BUFFER to your statements. Any script changes/adds you make will automatically invalidate that buffer and re-fetch from the database.

Don’t forget to remove the BUFFER keyword before moving to production!

You can read more about BUFFER and some optional parameters in the Qlikview Help.

-Rob
Facebook
Twitter
LinkedIn
RedditShare
Performance, Scripting
DROP FIELD Does Not Release All Space
Oct 28, 2013 5 Comments

During the “Performance Tuning” session at the Barcelona Masters Summit, Oleg Troyansky demonstrated using Document Analyzer to identify unused fields followed by DROP FIELD statements to remove those unused fields from the data model. Roland Vecera offered an interesting discovery.  DROP FIELD after a BINARY LOAD does not free the expected amount of memory.

For Example:
Binary dropfieldstest_dm.qvw;
DROP FIELD A,B;

Roland has found that a subsequent LOAD RESIDENT of each affected table is required to fully reduce disk and RAM consumption to the expected level.

A field in a QVW is represented by three storage structures:
1. Symbol table, which stores the unique values of the field.
2. Record pointers, a pointer on each table row to the symbol value.
3. State space, where field selections are tracked.

Based on testing and calculation, my interpretation is that in this scenario (BINARY LOAD/DROP FIELD), the Symbols and State space is released. However, the space occupied by the Record pointers is not released, i.e. the records are not rewritten. This may be a significant amount of space, particularly when a table contains many rows.

For most developers this will be an obscure issue. But for people tuning large applications, this may provide an “aha”moment.

Thanks Roland!
Facebook
Twitter
LinkedIn
RedditShare
Performance, Scripting
Autonumber() Key Fields and Sequential Integer Optimization
Sep 4, 2013 20 Comments

Today let’s reinforce some QV data model principles for us old timers and introduce a few tricks for newbies to Qlikview.

#1. Keys are not data. Key Fields in a Qlikview model should serve the data modeler, and not be used by chart Designers as data.

Consider two tables, OrderHeader (one row for each Order) and OrderDetails (one row for each Order Line). linked together by Field OrderID.

 

 

 

 

OrderID may be a value that you need to display in your charts. However, problems arise when you try to do things like count(OrderID). Which end of the connection should the expression count? It’s unreliable as discussed in detail here:
http://qlikviewnotes.blogspot.com/2010/01/best-way-to-count-keys-dont.html

The solution is to create a counter field on the table that represents the correct cardinality for the counter. If we are counting Orders, that would be the OrderHeader table.

In the LOAD of the OrderHeader table:

1 as OrderCounter

Part two of of the recommendation is to isolate the key field so it is not mistakenly used as a data field. We do this by prefixing the key field name with a special character and SETing the QV system variable “HidePrefix” to that character.

SET HidePrefix=’%’;

In the LOAD of both OrderHeader and OrderDetails:
OrderID as %OrderID

Fields that begin with the HidePrefix value will not show up in:
–  Current Selections.
– Dimension or Expression property dialog (unless “Show System Fields” is checked).

Of course, the specific values of OrderID may be useful to display in UI charts. In that case we must preserve it as a data item in one and only one table. We will include it in the LOAD of the OrderHeader table. Our data model now looks like this:

 

 

 

 

 

 

OrderID is available as a data field, but appropriately only from the OrderHeader table.

OrderCounter is now available as a field such that
=sum(OrderCounter)
will yield the correct Order count.

Now we (the Data Modelers!) own those “%” key fields! They are ours, we told the UI designers explicitly that “it is not data” .

Part three, and a very important part indeed, is to autonumber() the key fields. Autonumber() is a Qlikview lookup function that translates parameter values into integers. The sequential integers returned by autonumber() will reduce the RAM requirements and increase the linkage efficiency as detailed here
http://qlikviewnotes.blogspot.com/2008/05/memory-sizes-for-data-types.html
and
http://community.qlikview.com/blogs/qlikviewdesignblog/2012/11/20/symbol-tables-and-bit-stuffed-pointers

Admittedly, it gets a bit geeky. Bottom line, here is what you want to do for your keys:
autonumber(OrderID, ‘%OrderID’) as %OrderID

The autonumber() function converts values to sequential integers. The second parameter,  ‘%OrderID’, is important if you have multiple keys being autonumber() in your script.

To summarize:
#1. Keys are not data.
#2, Isolate keys using the “SET HidePrefix=x;” variable. Establish counter fields on the appropriate table.
#3. Use the Autonumber() function to convert key field values to sequential integers. This will minimize the memory footprint of the application and improve the efficiency of cross table look-ups.

My friend and colleague Barry Harmsen, author of QlikView 11 for Developers, who is a much wiser data modeler than I, will be discussing QV data modeling in depth with me at the Masters Summit for Qlikview in Europe this October. I hope you can join us!
Facebook
Twitter
LinkedIn
RedditShare
Performance, Scripting
Super Fast Method to Retrieve QVD High Value
Aug 29, 2013 16 Comments

Delta Load, sometimes called Incremental Load, is the technique of pulling only changed or new rows from a database and then merging those rows with a master QVD. The Delta Load pattern follows these general steps:

1. Determine high water mark (“last reload”)
2. Build WHERE predicate in syntax of target DB.
3. SQL SELECT delta rows.
4. Merge delta rows with QVD.
5. If Deletes, INNER JOIN entire set of Keys from DB with QVD

The first step is to determine what cutoff value — delta point — do we want to pass in the SQL SELECT WHERE clause to identify new rows. This value is usually the highest value in the existing QVD.

The most robust and reliable method for step one is loading with max() from the existing QVD. For example:
LOADmax(LastModified) asMaxModifiedFROMmyqvd.qvd (qvd); 

This works well, but reading the entire QVD can take a very looooong time for a large QVD.

A much faster method is to aggregate the max value for the Delta rows only and then save that value on the first row of the QVD. In subsequent delta loads, only the first row of the QVD is read to get the value. This is extremely fast and is not effected by QVD size. For example:

Facts:
SQLSELECT * 
FROMmytableWHERELastModified>= ‘$(vMaxModified)’;
JOIN(Facts)
LOADmax(LastModified) asHighWaterValue
RESIDENTFacts;
// Do QVD Merge…and STORE Facts INTO Facts.qvd; 
Retrieve value later with:
 FIRST 1 LOADHighWaterValueFROMFacts.qvd(qvd) 

The “HighWaterValue” field will contain a relatively small number of values and will therefore have a negligible impact on the size of the QVD. You will of course have to create the field the first time before trying to load it with the “FIRST 1…”.

If you are using Qlikview Components (QVC) V8+ for delta loading, you can enable this high performance strategy by setting the variable:
SETQvc.Loader.v.StoreMaxModFieldValue = -1; 

QVC will automatically create a high water field named Qvc.MaxModFieldValue
and detect the availability of the field on subsequent loads. There is no need to pre-create the field before turning on this feature.

The technique is part of the Advanced Scripting material I’ll be presenting at the upcoming Masters Summit for Qlikview in Europe this October. I’ll be discussing more about Delta Loads, including strategies for merging large QVDs and tables with non-unique keys. Review the full agenda here and decide if the Masters Summit might help take your Qlikview skills to the next level.
Facebook
Twitter
LinkedIn
RedditShare
General, Performance
Document Compression
Mar 28, 2011 8 Comments

Today I offer up a discussion of Qlikview “compression”. That is, the Qlikview features that make overall data get smaller, and in some cases, larger.

Should you care? In most cases no. But understanding what “knobs you can turn” can be a useful tool for capacity planning and application tuning. Let’s look at the practices and parameters that affect data size.

 Script Execution:  Data read from sources – such as database tables – are read in to memory (RAM) by the script execution (reload) process. Duplicate values are reduced to the unique set of values for each column. A “Gender” column has only two values – “Female” and “Male”, so the storage required for this column is minimal compared to a column that has a wide range (cardinality) of values such as a timestamp.  This is not really “compression” but rather what I call “de-duplication”.

The ratio of database storage to document storage is dependent on the data content as well as the use of common script techniques like separating timestamps into date and time fields. A typical database to document ratio is 10:1. For example, 2GB of database tables might require 200MB of document RAM.

QVW write to Disk: After reload, the Qlikview document (data tables and screen objects) is written from RAM to Disk as a *.qvw file. If compression is set on (default) for the document, the qvw will be compressed as it is written to disk. The compression results will vary depending on data content, but is typically in the range of 2-5 times. For example, a document that requires 200MB of RAM will require somewhere between 40MB and 100MB of Disk storage.

If compression is set to “None”, the document will be written to disk in the same format it existed in RAM and will occupy the same storage on disk as it utilized in RAM.
The Compression option for each Document is set in the Document Properties, General tab. The default compression for new documents is defined the User Settings, Save tab.

The compression option will of course impact the amount of disk storage used. But it also affects the amount of time it takes to read or write a qvw. I find that for most documents, an uncompressed document will write and read significantly faster than a compressed document. Some documents, especially large ones with high compression ratios, will read faster if compressed. The other factor is speed of the disk being used – local disk or network disk.

I typically do my development with compression off and then do a timing test with both options before migrating to the server.

QVW read from Disk: The *.qvw is loaded to RAM by a developer or on the Server by a user session. The amount of RAM required is the uncompressed size, regardless if compression was used to write the *.qvw to disk.  As discussed in the previous section, my experience is that uncompressed documents read from a local disk typically load up faster, but this is not always true and is worth testing on large documents.

­What is the compression factor for QVD files?
 
Zero.

A QVD file contains the physical representation of an in-memory Qlikview Table. This “RAM image” format is what allows an optimized QVD load to be so quick. The physical blocks of disk are read directly into Qlikview RAM, “ready to go”. Because QVD is the RAM image, there is no compression.

A QVD read with an optimized load will require the same RAM size as its size on disk (1:1). A QVD read with an un-optimized load may require significantly more RAM, due to some numeric fields being converted to strings. The expansion is typically about 2:1 but varies considerably.

Here is a summary of the various “compression points” and typical results.
Source
	
Destination
	
Ratio
	
Example
Result
	
Notes
Source DB
	
–
		
2GB
	
Raw Data
Source DB
	
Document RAM
	
10:1
	
200MB
	
Data de-duplication
Document RAM
	
QVW Disk
	
3:1
	
67MB
	
Save Compression=High
Document RAM
	
QVW Disk
	
1:1
	
200MB
	
Save Compression=None
QVW Disk
	
Document RAM
	
1:3
	
200MB
	
Save Compression=High
QVW Disk
	
Document RAM
	
1:1
	
200MB
	
Save Compression=None
Document RAM
	
QVD Disk
	
1:1
	
200MB
	
QVD always uncompressed
QVD Disk
	
Document RAM
	
1:1
	
200MB
	
Optimized load
QVD Disk
	
Document RAM
	
1:2
	
400MB
	
Non-Optimized load

If your documents are small and you are not experiencing performance issues, worry about none of this.

Compressed documents occupy less disk space and their smaller size makes them easier to manage for moving, backup, etc.

If you are trying to get a document to load faster, try turning off document compression and benchmark your results. Consider the type of disk when making this decision. Compression may more important in a network storage environment where reducing the amount of data transferred is a significant performance factor.

It’s important to understand that the document compression option has no impact on RAM usage. It only impacts the amount of data read and written to disk.
Facebook
Twitter
LinkedIn
RedditShare
Performance
Memory sizes for data types
May 29, 2008 5 Comments

An earlier post of mine When less data means more RAM discussed the ways in which storage (“Symbol” space) needed for field values can increase depending on how a field is loaded or manipulated. This generated some followup questions on the QlikCommunity forum about the optimal storage sizes for fields of various data types.

What’s presented below is information gleaned from the documentation, QT Support and experimentation. The numbers come from the document memory statistics file. I hope someone from QT will help me correct any errors.

QV fields have both an internal and external representation. There is a video “Datatype Handling in Qlikview” available on QlikAcademy that explores this subject.This post is concerned with the internal storage of fields.

Numbers

I’ve found that the storage size appears to be related to the number of total digits. Storage size in bytes, for various digit ranges:

1-10 digits, size=4
11 or more digits, size=13

The above sizes assume that the internal storage format is numeric, which is usually the case if loading from a database. Numbers loaded as text such as from a text file or inline, may be stored as strings which will occupy different sizes.

Dates, Times and Timestamps

Different Database systems provide various degrees of precision in timestamps and I assume the ODBC driver is also involved with the exact value provided to QV during the load. QV times are the fractional part of a day, using up to 9 digits to the right of the decimal point.

– Best size for a Date, 4 bytes.
– Best size for a full Time, 13 bytes.
– Best size for a full Timestamp, 13 bytes.

These sizes can increase when the field is manipulated. Want to get the date portion of a timestamp? Don’t use

date(aTimestamp)

date() is a formatting function, it doesn’t “extract” the underlying date portion. In many cases, it actually increases storage size because the result may be a string. Instead, use

floor(aTimestamp)

this will produce a 4 byte integer result.

A common technique for reducing the memory footprint of timestamps is to separate the timestamp into two fields, integer date and fractional time. You can further reduce the number of unique time values by eliminating the hundredths of seconds, or even eliminating the seconds if your application is ok with minute precision.

Strings

Thanks to QT support for providing this detail on Strings.

“The representation is that each symbol has a pointer (4/8 bytes on 32/64-bit platform) + the actual symbol space. This space is the number of bytes (UTF-8 representation) + 2 (1 is a flag byte and 1 is a terminating 0) + 0, 4 or 8 bytes that store the numeric representation of the field.”

So on the 32bit version, a non-numeric string occupies 6 bytes more than the length of the string itself. A numeric string occupies 10 more bytes. For example:

“a” uses 7 bytes
“1” uses 11 bytes

The only way to reduce the string footprint is to reduce the number of unique values. This can be done by breaking the string into component parts if that makes sense in the application. For example, the first 3 characters of a 10 character product code may be a product class. Breaking the field into ProductClass and ProductNumber fields may reduce the number of unique values.

If the strings are keys that don’t need to be displayed, the autonumber() or autonumberhash128() functions can be used to transform the values to 4 byte integers. With these functions you can also get the “sequential integer optimization” which reduces the symbols space to zero.

I’ve found that concatenating fields in autonumber like
autonumber(f1 & f2)
can sometimes produce false duplicates. Better to instead use autonumberhash128 like
autonumberhash128(f1, f2)
This seems to always produce correct results.

Sequential Integer Optimization

For each field, QV maintains both a Symbol table — the unique values of a field — and a State array that tracks which values are selected. If the symbol values are consecutive integers, a very clever optimization takes place. The Symbol space is eliminated and the State array is used to represent both selection state and value. This is a very beneficial effect of using the autonumber functions.

The values need not begin at zero for the optimization to take place, they only need to be consecutive. A set of 5000 consecutive dates will occupy no Symbol space. Take one date out of the middle and the storage reverts to the standard 4 bytes for each date.

It’s not always necessary to be concerned about memory usage. But when it is, I hope this information proves useful.

Facebook
Twitter
LinkedIn
RedditShare
Performance
64bit Implementation Experience
May 22, 2008 4 Comments

When I started using Qlikview, I mistakenly believed I would not need the 64bit version of Server. I thought that because my Analyzer users were using the QV Windows Client, the memory required to hold the document would come from the user’s machine. Wrong. When a document is opened from the server, the document is loaded into server memory.

The 32bit Server uses a single 2GB address space to contain all the currently loaded documents. When the number of users increased, and more importantly, the number of concurrent documents, the Server ran out of memory. This unfortunately causes a Server crash, taking all the users down, not just the user that pushed it over the limit. It became clear we needed the 64bit edition.

Upgrading the Server (QVS) to 64bit was easy. It immediately solved the memory issue and allowed for many documents to be used simultaneously with no problem.

QV Publisher (QVP) turned out to be a different story. I initially installed Publisher on the same machine as Server but immediately ran into a problem with the availability of 64bit ODBC drivers.

Any ODBC Driver used in 64bit Windows must be written as 64bit capable. I was using four ODBC data sources – IBM DB2, MS SQLServer, Lotus Domino and SAS. 64Bit SQLServer drivers are supplied with the OS. DB2 64bit drivers are available, but they can be expensive. The sticking point was that there were no 64bit drivers available for Lotus Domino and SAS.

My first step was to move Publisher to a 32bit machine. This turns out to be a recommended practice anyway – host Server and Publisher on different machines. But I also had an application in development that would require 64bit for a full reload. How would I reload this application when it moved to production? I expected I would see more of these applications that required 64bit for reload.

Publisher provides for defining multiple Execution Services (XS) on different machines. XS is the service that performs the reload process. The multiple XS’s can be viewed and managed from a single Publisher Control panel screen. This feature allowed me to define an additional XS on a 64 bit server.

My configuration now consists of three servers. A 64bit QVS, one 32bit QVP and one 64bit QVP. The 32bit QVP is loaded with all the ODBC drivers I need, the 64bit QVP has no drivers installed. The restriction in this configuration is that reloads on the 64bit QVP may only load QVDs and other non-ODBC datasources. In some cases, this may require a script to be split into two or more documents. Thus far, this restriction has proven to be only a minor inconvenience. The two reloads can be connected together by utilizing a RequestEDX task to trigger the second reload task.

We chose not to migrate the developer workstations to 64bit due to the limited availability of ODBC drivers and other software. Most of the applications that require 64bit for reload can still be developed on a 32bit machine by loading a limited number of records. We did set up a single shared 64bit workstation that can be used by any developer when they require 64bit.

Migrating QVS to 64bit provides the capacity to support many concurrent documents and users. If you plan to use the 64bit QVP, check on 64bit driver availability as part of your planning process.
Facebook
Twitter
LinkedIn
RedditShare
Performance
When less data means more RAM
May 19, 2008 3 Comments

I attended Niklas Boman’s excellent Performance Tuning talk at Qonnections in Miami. One of his tuning recommendations was to reduce the number of rows and columns when possible. This will probably always have a positive impact on chart calculation time, but if done incorrectly, reducing the quantity of data can have an adverse impact on RAM usage.

Consider a QVD file with one million rows. The QVD was loaded from a database and contains two fields:

aNum – unique integers, 1M unique values.
aDate – dates distributed equally throughout 2000-2003, 1,460 unique values.

QV stores each of these values as integers, occupying 4 bytes of RAM each. Nice and compact.

Which of the following statements will create a QVW that uses more RAM? Statement A, which loads 1000K rows or Statement B, which loads only 750K rows?

Statement A:// Load all 1,000,000 rows
LOAD * FROM qvdData.qvd (qvd);

Statement B:
// LOAD only 2001+ which should be 750,000 rows
LOAD * FROM qvdData.qvd (qvd)
WHERE year(aDate) > 2000;
Pat yourself on the back if you answered “B”. B will use more RAM! More RAM for less data? Why? Because “B” causes an unoptimized load which results in QV converting the Integer representations of the data to String representation.

QV can load QVDs in one of two modes – Optimized or Unoptimized (more in the Ref Guide). In an optimized load, the RAM image from the QVD is loaded directly into memory. An optimized load is indicated in the Loading message in the progress window. (Note to development: would be nice if the optimized message appeared in the log as well).

In unoptimized mode, the QVD image is “unwrapped” and the data processed discretly. This causes the internal formatting to be lost and the data is stored internally as Mixed. So each “aNum” that previously occupied 4 bytes, now takes 9 bytes. “aDate” now averages 18.96 bytes each.

It’s the WHERE clause that forces the unoptimized load. Generally, adding fields or anything that causes a field value to be examined will force an unoptimized load. Examples of unoptimzed loads:

LOAD *, year(aDate) as Year FROM qvdData.qvd (qvd) ;
LOAD *, rowno() as rowid FROM qvdData.qvd (qvd)

Even a WHERE clause that does not reference any field will be unoptimized:
LOAD * FROM qvdData.qvd (qvd)
WHERE 1=1;

How can you tell how much RAM a field is using? “Document Settings, General, Memory Statistics” button will generate a .mem text file that contains a storage size for the “Symbols” (values) of each field. You can view the .mem file directly or load it into a QVW for processing. The 8.5 beta provides a “Qlikview Optimizer.qvw” for just this purpose. I’ve uploaded this file to the “Share Qlikviews” section of QlikCommunity if you don’t have 8.5.

WorkaroundsI’ve found that I can usually “fix” the field by setting the desired format in the Document Properties and checking the “Survive Reload” box. You can also apply formats in the load script, but I find this tedious if I have more than a few fields. Here are some alternative workarounds.

To create additional fields, use a RIGHT JOIN after the optimized load.
Instead of:
LOAD *, year(aDate) as Year FROM qvdData.qvd (qvd);

Use:
tdata:
LOAD * FROM qvdData.qvd (qvd);
RIGHT JOIN LOAD DISTINCT *, year(aDate) as Year
RESIDENT tdata;

For a subset selection, version 8 allows an optimized load using where exists() if the exists clause refers to only a single field. This means you’ll have to generate the desired values before the load using the same field name. Something like this:

//Generate table of the dates we want 2001-2004
LET vStartDate=num(MakeDate(2001,1,1)-1);
LET vEndDate=num(MakeDate(2004,12,31));
DateMaster:
LOAD date($(vStartDate) + IterNo()) as aDate
AUTOGENERATE 1
WHILE $(vStartDate) + IterNo() <= $(vEndDate);
// Optimized load of the subset dates
tdata:
LOAD * FROM qvdData.qvd (qvd) WHERE exists(aDate);
DROP TABLE DateMaster; // No longer needed

In some cases, the above example will give you an additional optimization. Something I call the “sequential integer optimization” which I’ll discuss on another day.

Worrying about RAM is not always necessary and many times is not worth the effort, especially if it makes your script harder to follow. However, for large datasets, particularly in the 32bit environment, you may be forced to optimize RAM usage. Using the mem files allows you to identify the most productive candidates for tuning.

The QV Reference Guide points out that an optimized load will run faster than an unoptimized load. I think it would be useful to have brief discussion of the impact on RAM usage as well.

Qlik optimized load statements
Share this message
Friday Qlik Test Prep: How do I maintain an optimized load in Qlik Sense and QlikView?

For the new year, we’re doing something new at Bitmetric. Each Friday we’ll share a test question that is representative of what you’ll find on the Qlik Business Analyst, Data Architect or System Administrator certification exams. Including the strange or vague wording that’s sometimes found in these exams 😉

We’ll follow up each Monday with the correct answer, as well as some additional explanation and insights. We hope this will help many of you prepare for your Qlik certifications, or at the very least provide a bit of fun and discussion.

Last Friday, we posted the following question about Qlik optimized load:
Bitmetric Friday Qlik Test Prep: a business user receives a dataset with too many countries and has requested that these are limited to 'The Netherlands' only. The data architect must revise the script in such a way that the load is optimized and occurs as fast as possible. Which answer provides the best solution?
The correct answer is answer C

This provides an optimized load of the QVD which is the fastest way of loading a QVD into Qlik. If we look at the others options, we’ll see that answers A and B will also work but neither will have an optimized load (more on that below). Answer D does not even work at all because it creates a duplicate field in the table which leads to a script error (field names must be unique within a table). Even without the script error, the expression does not limit the loaded rows, it only sets null values for countries that aren’t ‘The Netherlands’.
So why would you want an optimized load?

For speed! 🚀 An optimized QVD load is the fastest way to load data from a QVD into Qlik. And while even a non-optimized load from is typically much faster than loading from other sources, the difference between an optimized load and non-optimized can be significant. For example, on a sample set of 22 million rows the optimized load was 3 times faster than a non-optimized load. Imagine the difference when you’re dealing with 100’s of millions of rows or if you need to load data from many different QVDs. This will save load time and will keep you from getting distracted while waiting for the reload dialog to finish 😉. Of course this also applies to server reload performance when you’re running scheduled tasks.
How do you ensure an optimized load?

Many operations will cause a QVD load to be non-optimized. To keep it optimized, limit your operations to:

    Renaming fields (using an alias). You can also load the same field twice under a different alias. This can be useful to create a separate key field.
    Omitting fields by not including them in the LOAD statement
    Use a single WHERE EXISTS, with a single parameter. So WHERE EXISTS([Country]) is OK, WHERE EXISTS([Country], [ISO Country Code]) is not.
    JOIN, KEEP or CONCATENATE with another table
    LOAD DISTINCT will also keep a load optimized. The DISTINCT part will be processed after the LOAD however, so you might still want to think twice before applying it to very large QVDs.

The following operations prevent an optimized load. If you want an optimized load then don’t do any of the following:

    Transform a field. For example, Upper([Country]) AS [Country Capital]. Or by using an ApplyMap()
    Using a WHERE clause, other than a single WHERE EXISTS(). This is why answers A and B will not result in an optimized load.
    Load data into a mapping table
    Alias the field you’re using in the WHERE EXISTS clause

How can you check if a load is optimized?

Besides manually checking your script for the points listed above, the easiest way to check is to keep an eye on the script log, either in the data load progress window or the log file. If you see (QVD (row-based) optimized) then you’ll know you have an optimized load.
September 5, 2018 The Effect of Qlik Data Table Order on Chart Calculation Time pg. 1
The Effect of Qlik Data Table Order on Chart Calculation Time
Over several years in my tuning practice I have sometimes been surprised that a data model change I
expected to improve performance would instead cause a net increase in overall chart calc time for the
application. The problem typically occurred after I added a Join and the decreased performance was not
necessarily in the area that I was focused on. It seemed to be a “side effect”.
I’ve done some testing to try to narrow down the issue and describe the problem. I’ve created a test
model and script that illustrates the issue.
Example 1
Consider this as the “baseline” script. This script generates 500k unique OrderId values with each Order
having 10 of 200 possible Products. The result is a table of 5M orders (500k * 10 products). 20% of
possible ProductId are used.
The OrderId values are loaded in order, as they would typically appear when loaded from a database.
The creation of a QVD with the STORE statement in this script has no significance in the final data model.
The QVD is generated as an artifact for investigation.
LET vNoOrders = 500000;
Product:
LOAD
RecNo() as ProductId
,Hash128(RecNo()) as Product
AutoGenerate 1000
;
OrderDetail:
LOAD
RecNo() * 2 as OrderId
,Iterno() + Mod(RecNo(), 190) as ProductId
,(Mod(RecNo(), 1000) + 1) * 2 as LineTotal
,1 as X
AutoGenerate $(vNoOrders)
while IterNo() <= 10
;
STORE OrderDetail into OrderDetail-Example1.qvd;
September 5, 2018 The Effect of Qlik Data Table Order on Chart Calculation Time pg. 2
This script generates a data model with the following meta values.
$Table $Rows $Fields
OrderDetail 5,000,000 4
Product 1,000 2
$Table $Field $FieldNo
OrderDetail OrderId 1
OrderDetail ProductId 2
OrderDetail LineTotal 3
OrderDetail X 4
Product ProductId 1
Product Product 2
Note that Field “X” is a very trivial field with a Dual value of “1” on every row. Field “X” is not used in
any of the following sample charts or calculations.
The result of this sample script is deterministic. Repeated executions of the script will generate the same
data model and values.
For demonstrating Calculation Time, I will use an example pivot table 1with the following data:
The typical Calculation Time 2 on my laptop3 machine is ~6,000 milliseconds (6 seconds).
1 A pivot table is used because it illustrates the most extreme example of this phenomena, typically a 100%
increase in calc time. A Straight table using the same Dimensions and Expressions will exhibit ~75% increase in calc
time.
2 Calculation times for QlikView tests were obtained from the “Sheet Properties, Objects” view. Similar results
were observed on Qlik Sense using both the devtool extension and a custom javascript tester that measured the
time taken for an object.GetLayout() call.
3 Testing machine is a Dell XPS 15 9550, Intel i7 @2.60GHz, 32 GB RAM, Windows 10 version 1703.
Dimensions:
OrderId – sorted Load Order, Original
Product – sorted Text, Ascending
Expression: sum(LineTotal)
September 5, 2018 The Effect of Qlik Data Table Order on Chart Calculation Time pg. 3
Example 2
Now let’s build the same logical data model slightly differently. In this case, the Field “X” will be added
to the OrderDetail table with a script Join operation.
LET vNoOrders = 500000;
Product:
LOAD
RecNo() as ProductId
,Hash128(RecNo()) as Product
AutoGenerate 1000
;
OrderDetail:
LOAD
RecNo() * 2 as OrderId
,Iterno() + Mod(RecNo(), 190) as ProductId
,(Mod(RecNo(), 1000) + 1) * 2 as LineTotal
// ,1 as X
AutoGenerate $(vNoOrders)
while IterNo() <= 10
;
LEFT JOIN (OrderDetail)
LOAD RecNo() as ProductId,
1 as X
AutoGenerate 1000
;
STORE OrderDetail into OrderDetail-Example2.qvd;
Viewing the metadata, the logical data model appears to be the same as Example 1.
$Table $Rows $Fields
OrderDetail 5,000,000 4
Product 1,000 2
$Table $Field $FieldNo
OrderDetail ProductId 1
OrderDetail OrderId 2
OrderDetail LineTotal 3
OrderDetail X 4
Product ProductId 1
Product Product 2
The same Pivot table will now take ~15,000 milliseconds to calculate, more than 2.5X longer than
Example 1, even though operating on the “same” data model and values.
September 5, 2018 The Effect of Qlik Data Table Order on Chart Calculation Time pg. 4
Is there an internal difference between the Example 1 and Example 2 data models? Using a QVD as a
proxy4 I attempted to discern any difference between the two models. I examined the QVD files using
the QViewer QVD Viewer 5 tool.
Viewing the Example 1 QVD shows that data is in the order as generated by the script. The table is in
order by OrderId followed by some subset of ten ProductId values.
4 I am assuming that a generated QVD will accurately reflect the record order of a Qlik in-memory data table. This
assumption may be incorrect, and I do not have confirmation from Qlik R&D one way or the other.
5 QViewer QVD Viewer tool is available from http://www.easyqlik.com/
September 5, 2018 The Effect of Qlik Data Table Order on Chart Calculation Time pg. 5
What does the Example 2 QVD look like in QViewer? The data table appears to be sorted by ProductId
(as a result of the Join) and the OrderId order appears to be somewhat random.
Sorting of OrderId (the primary dimension of the chart) clearly has an impact on the calc time. Is it that
because the Data Table is in the same order as the OrderId Symbol table? Or is it simply that the Data
Table is sorted?
September 5, 2018 The Effect of Qlik Data Table Order on Chart Calculation Time pg. 6
Example 3:
Let’s restore the pre-join sort order of the OrderDetails table by adding a script step after the Join
introduced in Example 2.
OrderDetail2:
NoConcatenate
LOAD * Resident OrderDetail
Order by OrderId, ProductId
;
DROP Table OrderDetail;
RENAME Table OrderDetail2 to OrderDetail;
The Pivot Table once again reports calc times in the ~6,000 millisecond range, same as Example 1.
September 5, 2018 The Effect of Qlik Data Table Order on Chart Calculation Time pg. 7
Example 4
Now let’s address the question of whether optimal performance arises from a match in sorting between
Symbol and Data tables or simply a sorted Data Table?
In this example I’ll generate the OrderId values in a random numeric order.
LET vNoOrders = 500000;
OrderIdTemp:
LOAD
ceil(Rand() * $(vNoOrders)) * 2 as OrderId
AutoGenerate $(vNoOrders)
;
Product:
LOAD
RecNo() as ProductId
,Hash128(RecNo()) as Product
AutoGenerate 1000
;
OrderDetail:
LOAD
OrderId
,Iterno() + Mod(RecNo(), 190) as ProductId
,(Mod(RecNo(), 1000) + 1) * 2 as LineTotal
,1 as X
Resident OrderIdTemp
while IterNo() <= 10
;
DROP Table OrderIdTemp;
STORE OrderDetail into OrderDetail-Example4.qvd;
Load order for OrderId, as demonstrated by a Listbox looks something like:
The OrderId values in the Data Table, although random as to numeric sort order, are grouped together.
Calc time for the Pivot Table is now ~7,000 milliseconds, similar to Example 1.
September 5, 2018 The Effect of Qlik Data Table Order on Chart Calculation Time pg. 8
Example 5
Now we will switch to the Join method of creating Field X while still using random order for OrderId.
LET vNoOrders = 500000;
OrderIdTemp:
LOAD
ceil(Rand() * $(vNoOrders)) * 2 as OrderId
AutoGenerate $(vNoOrders)
;
Product:
LOAD
RecNo() as ProductId
,Hash128(RecNo()) as Product
AutoGenerate 1000
;
OrderDetail:
LOAD
OrderId
,Iterno() + Mod(RecNo(), 190) as ProductId
,(Mod(RecNo(), 1000) + 1) * 2 as LineTotal
// ,1 as X
Resident OrderIdTemp
while IterNo() <= 10
;
DROP Table OrderIdTemp;
LEFT JOIN (OrderDetail)
LOAD RecNo() as ProductId,
1 as X
AutoGenerate 1000
;
STORE OrderDetail into OrderDetail-Example5.qvd;
Pivot Table calc time is now in the ~16,000 range, similar to the Join Example 2.
Example 6
Let’s add a sort step to Example 5. This sort will be strictly numeric on OrderId, ProductId – which will
not be the same order as the OrderId Symbol table.
OrderDetail2:
NoConcatenate
LOAD * Resident OrderDetail
Order by OrderId, ProductId
;
DROP Table OrderDetail;
RENAME Table OrderDetail2 to OrderDetail;
Calc time is now in the ~6,500 range, like Example 4. So the Data Table sort does not have to match the
Symbol table. But having some organization results in best performance.
September 5, 2018 The Effect of Qlik Data Table Order on Chart Calculation Time pg. 9
Example 7
Now let’s sort OrderId by something that is neither a natural sort or a symbol table order.
LET vNoOrders = 500000;
OrderIdTemp:
LOAD
ceil(Rand() * $(vNoOrders)) * 2 as OrderId
AutoGenerate $(vNoOrders)
;
Product:
LOAD
RecNo() as ProductId
,Hash128(RecNo()) as Product
AutoGenerate 1000
;
OrderDetail:
LOAD
OrderId
,if(Iterno() = 1, Rand(), peek('SortKey')) as SortKey
,Iterno() + Mod(RecNo(), 190) as ProductId
,(Mod(RecNo(), 1000) + 1) * 2 as LineTotal
// ,1 as X
Resident OrderIdTemp
while IterNo() <= 10
;
DROP Table OrderIdTemp;
LEFT JOIN (OrderDetail)
LOAD RecNo() as ProductId,
1 as X
AutoGenerate 1000
;
OrderDetail2:
NoConcatenate
LOAD * Resident OrderDetail
Order by SortKey, ProductId
;
DROP Table OrderDetail;
RENAME Table OrderDetail2 to OrderDetail;
STORE OrderDetail into OrderDetail-Example7.qvd;
The sort field of record is “SortKey”, which is a 1-1 match with OrderId. So OrderId’s will be grouped
together, although not likely to be in the Load Order expected by the chart.
Calc times are now in the ~7,000 range but will vary between reloads by a couple hundred milliseconds.
This low number seems to suggest that having some organization of OrderId matters, and the variations
between reloads is the time required to sort the results into chart order.
My hypothesis at this point is that a sort of the Data Table OrderId values is required to bucket the
Expression results.
September 5, 2018 The Effect of Qlik Data Table Order on Chart Calculation Time pg. 10
Example 8
LET vNoOrders = 500000;
Product:
LOAD
RecNo() as ProductId
,Hash128(RecNo()) as Product
AutoGenerate 1000
;
OrderDetail:
LOAD
(Mod(RecNo()-1, $(vNoOrders)) + 1) * 2 as OrderId
,Mod(RecNo(), 199) + 1 as ProductId
,(Mod(RecNo(), 1000) + 1) * 2 as LineTotal
,1 as X
AutoGenerate $(vNoOrders) * 10
;
STORE OrderDetail into OrderDetail-Example8.qvd;
In this script each OrderId is generated once in a block and then each block is repeated 10 times with
different ProductId values. So each block of 1/10 is sorted, but there are 10 repeating blocks, each must
be sorted to achieve an OrderId sort.
Performance for this model is in the ~6,800 range.
My conclusion at this juncture is that the greater the entropy of OrderId, the longer an intermediate sort
will take, impacting chart Calc Time.
September 5, 2018 The Effect of Qlik Data Table Order on Chart Calculation Time pg. 11
Example 9
Let’s disorganize OrderId to the maximum possible by sorting the Data Table rows by an unrelated
random value.
LET vNoOrders = 500000;
Product:
LOAD
RecNo() as ProductId
,Hash128(RecNo()) as Product
AutoGenerate 1000
;
OrderDetail:
LOAD
RecNo() * 2 as OrderId
,Iterno() + Mod(RecNo(), 190) as ProductId
,(Mod(RecNo(), 1000) + 1) * 2 as LineTotal
,1 as X
AutoGenerate $(vNoOrders)
while IterNo() <= 10
;
OrderDetail2:
LOAD
*,
rand() as SortKey
Resident OrderDetail
;
DROP Table OrderDetail;
OrderDetail3:
NoConcatenate
LOAD *
Resident OrderDetail2
Order By SortKey
;
DROP Table OrderDetail2;
RENAME Table OrderDetail3 to OrderDetail;
STORE OrderDetail into OrderDetail-Example9.qvd;
Calc time is now in the ~17,00 millisecond range, varying +/- 500 milliseconds between reloads. Each
reload may generate a slightly different degree of randomness and disorganization.
September 5, 2018 The Effect of Qlik Data Table Order on Chart Calculation Time pg. 12
Results Summary
Example Description OrderId
Disorganization
Pivot Table Calc Straight Table
Calc
1 Baseline None ~6000 ~280
2 Join High ~16000 ~480
3 Post join sort None ~6000 ~280
4 Radomly/
generated, but
grouped
Low ~7000 ~290
5 OrderId
generated in
groups, then Join
High ~16000 ~480
6 Example 5 but
then sorted by
OrderId,
ProductId
None ~6500 ~280
7 OrderId sorted
by random
SortKey per
OrderId
Low ~7000 ~290
8 OrderId
generated in 10
repeating blocks
Low ~6800 ~480
9 Rows sorted by
random value
High ~17000 ~1100
Conclusion
In addition to row-by-row calculation, the primary Dimension values must be sorted to allow the
Expression results to be bucketed. The more disorganized the Dimensional values, the longer this
sorting step takes.
September 5, 2018 The Effect of Qlik Data Table Order on Chart Calculation Time pg. 13