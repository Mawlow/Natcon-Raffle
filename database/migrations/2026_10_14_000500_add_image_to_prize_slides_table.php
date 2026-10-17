<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** A photo of the prize — the brand new car — shown large on the Prize Display. */
    public function up(): void
    {
        Schema::table('prize_slides', function (Blueprint $table) {
            $table->string('image', 255)->nullable()->after('logos');
        });
    }

    public function down(): void
    {
        Schema::table('prize_slides', function (Blueprint $table) {
            $table->dropColumn('image');
        });
    }
};
