<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Raffle files: an event's raffles kept together. A file is made with just
     * a name, then given its participant list (one CSV), and every raffle made
     * in it starts with a copy of those participants — so in the Control
     * Center the operator picks the file and draws its raffles one by one.
     */
    public function up(): void
    {
        Schema::create('raffle_files', function (Blueprint $table) {
            $table->id();
            $table->string('name', 160);
            // The participant CSV, kept so raffles made later get the same people.
            $table->string('participants_path')->nullable();
            $table->string('participants_filename')->nullable();
            $table->unsignedInteger('participants_count')->default(0);
            $table->timestamp('participants_uploaded_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::table('raffles', function (Blueprint $table) {
            // Deleting a file keeps its raffles; they just stop being filed.
            $table->foreignId('raffle_file_id')->nullable()->after('id')->constrained('raffle_files')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('raffles', function (Blueprint $table) {
            $table->dropConstrainedForeignId('raffle_file_id');
        });

        Schema::dropIfExists('raffle_files');
    }
};
